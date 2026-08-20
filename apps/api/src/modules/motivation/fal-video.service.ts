import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MotivationSettingsService } from './motivation-settings.service';

/** Ответ провайдера на постановку задачи в очередь. */
export type FalSubmitResult = {
  requestId: string;
  /** Провайдер возвращает готовые ссылки на статус и результат — храним их,
   *  чтобы не собирать URL из имени модели самим. */
  statusUrl: string;
  responseUrl: string;
};

export type FalPollResult =
  | { state: 'running' }
  | { state: 'ready'; videoUrl: string }
  | { state: 'failed'; reason: string };

const QUEUE_BASE = 'https://queue.fal.run';

/**
 * Хост подписанной ссылки — для лога.
 *
 * Целиком её писать нельзя: подпись в query это одноразовый доступ на запись,
 * то есть учётные данные, и в логах им не место.
 */
export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'неразобранный url';
  }
}
const STORAGE_BASE = 'https://rest.alpha.fal.ai';

/**
 * Тело запроса под конкретную видеомодель.
 *
 * Набор полей у провайдеров разный: Wan не знает про `aspect_ratio`, Vidu
 * называет звук `audio`, а не `generate_audio`. Лишнее поле уходит в платный
 * запрос, а провайдер уже показал, что берёт деньги и за то, чего не смог
 * разобрать — на этом однажды сгорело $2.50.
 *
 * Соотношение сторон нигде не передаётся намеренно: кадр мы отдаём уже
 * кадрированным в 9:16, и модели наследуют его от картинки.
 */
export function buildVideoRequest(input: {
  imageUrl: string;
  prompt: string;
  seconds: number;
  audio: boolean;
  model: string;
}): Record<string, unknown> {
  const request: Record<string, unknown> = {
    image_url: input.imageUrl,
    prompt: input.prompt,
    duration: input.seconds,
    resolution: '720p',
  };
  if (input.model.includes('vidu')) request.audio = input.audio;
  else request.generate_audio = input.audio;
  // Seedance ждёт соотношение явно, остальные выводят его из кадра.
  if (input.model.includes('seedance')) request.aspect_ratio = '9:16';
  return request;
}

/** Разворачивает `detail` провайдера в короткий код для лога и админки. */
function describeFailure(detail: unknown): string {
  if (typeof detail === 'string') return detail.slice(0, 200);
  if (Array.isArray(detail)) {
    const first = detail[0] as { msg?: string; type?: string } | undefined;
    const text = first?.type ?? first?.msg;
    if (text) return String(text).slice(0, 200);
  }
  return 'no_video_in_response';
}

/**
 * Клиент очереди fal.ai для оживления картинки.
 *
 * Генерация занимает минуты, поэтому синхронного вызова здесь нет вообще:
 * `submit` ставит задачу и возвращает идентификатор, `poll` спрашивает
 * результат следующим тиком воркера. Вебхук был бы дешевле, но требует
 * публичного URL и проверки подписи — это отдельный шаг.
 */
@Injectable()
export class FalVideoService {
  private readonly logger = new Logger(FalVideoService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly settings: MotivationSettingsService,
  ) {}

  /** Настроен ли сервис. Воркер не должен занимать задачу, если ключа нет. */
  get enabled(): boolean {
    return Boolean(this.config.get<string>('FAL_KEY'));
  }

  private key(): string {
    const key = this.config.get<string>('FAL_KEY');
    if (!key)
      throw new ServiceUnavailableException('FAL_KEY is not configured');
    return key;
  }

  /** Имя модели — нужно учёту стоимости: тарифы у провайдеров разные. */
  async modelId(): Promise<string> {
    return (await this.settings.read()).videoModel;
  }

  /** Длительность ролика в секундах. Цена линейна по ней, поэтому значение
   *  вынесено в конфиг, а не зашито. */
  async durationSeconds(): Promise<number> {
    return (await this.settings.read()).videoSeconds;
  }

  /** Звук по умолчанию выключен: он удваивает стоимость токенов, а подпись и
   *  музыку мы накладываем своим пайплайном. */
  async audioEnabled(): Promise<boolean> {
    return (await this.settings.read()).videoAudio;
  }

  async submit(input: {
    imageUrl: string;
    prompt: string;
  }): Promise<FalSubmitResult> {
    // Проверяем вход сами, до сети. Провайдер принимает кривое тело, отвечает
    // 200 IN_QUEUE и всё равно выставляет счёт: на живой проверке запрос с
    // побитым JSON обошёлся в $2.50 — вдесятеро дороже удачного ролика.
    if (!input.imageUrl.trim())
      throw new BadRequestException('Video generation requires an image url');
    if (!input.prompt.trim())
      throw new BadRequestException('Video generation requires a prompt');
    const settings = await this.settings.read();
    const response = await fetch(`${QUEUE_BASE}/${settings.videoModel}`, {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        authorization: `Key ${this.key()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(
        buildVideoRequest({
          imageUrl: input.imageUrl,
          prompt: input.prompt,
          seconds: settings.videoSeconds,
          audio: settings.videoAudio,
          model: settings.videoModel,
        }),
      ),
    });
    if (!response.ok)
      throw new BadGatewayException(
        `Video provider error ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    const payload = (await response.json().catch(() => null)) as {
      request_id?: string;
      status_url?: string;
      response_url?: string;
    } | null;
    if (!payload?.request_id)
      throw new BadGatewayException('Video provider returned no request id');
    // Ссылки берём только те, что прислал провайдер. Собирать их из имени
    // модели нельзя: на реальном ответе база оказалась `fal-ai/bytedance`,
    // а не полный путь `fal-ai/bytedance/seedance/v1/pro/image-to-video`.
    if (!payload.status_url || !payload.response_url)
      throw new BadGatewayException('Video provider returned no job urls');
    return {
      requestId: payload.request_id,
      statusUrl: payload.status_url,
      responseUrl: payload.response_url,
    };
  }

  async poll(job: {
    statusUrl: string;
    responseUrl: string;
  }): Promise<FalPollResult> {
    const status = await fetch(job.statusUrl, {
      signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Key ${this.key()}` },
    });
    if (!status.ok)
      throw new BadGatewayException(
        `Video provider status error ${status.status}`,
      );
    const state = (await status.json().catch(() => null)) as {
      status?: string;
    } | null;
    // IN_QUEUE и IN_PROGRESS — обычное ожидание, не ошибка.
    if (state?.status !== 'COMPLETED') {
      if (state?.status === 'FAILED')
        return { state: 'failed', reason: 'provider_failed' };
      return { state: 'running' };
    }

    const result = await fetch(job.responseUrl, {
      signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Key ${this.key()}` },
    });
    if (!result.ok)
      throw new BadGatewayException(
        `Video provider result error ${result.status}`,
      );
    const payload = (await result.json().catch(() => null)) as {
      video?: { url?: string };
      detail?: unknown;
    } | null;
    const url = payload?.video?.url;
    if (url) return { state: 'ready', videoUrl: url };
    // Провайдер отдаёт и ошибки валидации со статусом COMPLETED, а причину
    // кладёт в `detail`. Без неё в логе оставался бы бесполезный «нет видео».
    return { state: 'failed', reason: describeFailure(payload?.detail) };
  }

  /**
   * Кладёт кадр в хранилище провайдера и возвращает ссылку на него.
   *
   * Скармливать fal прямую ссылку на наш S3 нельзя: на живой проверке он
   * тянул картинку 99 секунд и сдался с `file_download_error`, хотя тот же
   * URL отдаётся снаружи за доли секунды. Свой бакет в Ceph он не осилил.
   */
  async upload(
    bytes: Buffer,
    contentType = 'image/jpeg',
    fileName = 'story.jpg',
  ): Promise<string> {
    const initiatedAt = Date.now();
    const initiate = await fetch(
      `${STORAGE_BASE}/storage/upload/initiate?storage_type=fal-cdn-v3`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          authorization: `Key ${this.key()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          content_type: contentType,
          file_name: fileName,
        }),
      },
    );
    if (!initiate.ok)
      throw new BadGatewayException(
        `Video storage error ${initiate.status}: ${(await initiate.text()).slice(0, 200)}`,
      );
    const slot = (await initiate.json().catch(() => null)) as {
      file_url?: string;
      upload_url?: string;
    } | null;
    if (!slot?.file_url || !slot.upload_url)
      throw new BadGatewayException('Video storage returned no upload slot');

    const initiateMs = Date.now() - initiatedAt;

    const startedAt = Date.now();
    const put = await fetch(slot.upload_url, {
      method: 'PUT',
      signal: AbortSignal.timeout(120_000),
      headers: { 'content-type': contentType },
      body: new Uint8Array(bytes),
    });
    const putMs = Date.now() - startedAt;
    if (!put.ok) {
      // Подробности — только в лог. Текст исключения попадает в
      // `videoErrorCode`, обрезается до 200 символов и сравнивается с
      // PERMANENT_FAILURES по точному совпадению: переменная строка сломала бы
      // и логику повторов, и группировку сбоев в админке.
      const detail = await put.text().catch(() => '');
      this.logger.error(
        [
          `Заливка кадра не прошла: ${put.status}`,
          `${bytes.length} Б за ${putMs} мс`,
          `слот выдан за ${initiateMs} мс`,
          `хост ${hostOf(slot.upload_url)}`,
          `server=${put.headers.get('server') ?? '—'}`,
          `cf-ray=${put.headers.get('cf-ray') ?? '—'}`,
          detail ? `ответ: ${detail.slice(0, 300)}` : 'ответ пуст',
        ].join(', '),
      );
      throw new BadGatewayException(
        `Video storage upload failed ${put.status}`,
      );
    }
    this.logger.log(
      `Кадр залит: ${bytes.length} Б за ${putMs} мс (слот за ${initiateMs} мс)`,
    );
    return slot.file_url;
  }

  /** Скачивание готового ролика. Провайдер отдаёт временную ссылку, поэтому
   *  файл сразу перекладывается в наш S3 вызывающим кодом. */
  async download(url: string): Promise<Buffer> {
    const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok)
      throw new BadGatewayException(
        `Unable to download generated video: ${response.status}`,
      );
    return Buffer.from(await response.arrayBuffer());
  }
}
