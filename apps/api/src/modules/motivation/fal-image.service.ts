import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { buildFalImageRequest, parseFalImageUrl } from './fal-image-request';
import { IMAGE_SIZE } from './image-cost';

const QUEUE_BASE = 'https://queue.fal.run';

/**
 * Модель по умолчанию. Seedream V4 у fal стоит фиксированные $0.03 за
 * изображение независимо от разрешения — для нашей вертикали 1024×1536
 * (1.57 МП) это дешевле, чем помегапиксельные модели. Меняется через
 * `MOTIVATION_IMAGE_MODEL_FALLBACK`; вместе с моделью нужно поправить
 * FAL_IMAGE_RATE_USD в image-cost.ts, иначе дневной потолок расхода соврёт.
 */
const DEFAULT_MODEL = 'fal-ai/bytedance/seedream/v4/text-to-image';

/** Пауза между опросами очереди и общий срок ожидания. */
const POLL_INTERVAL_MS = 2_000;
const POLL_DEADLINE_MS = 180_000;

/**
 * Запасной поставщик картинок.
 *
 * Основной путь — релей с gpt-image-2, и он же наш единственный канал: когда
 * релей ложится («upstream_unavailable» при исправном ключе — та же болезнь,
 * что описана у запасной текстовой модели), кадров нет ни у одного поста.
 * fal — другой апстрим, поэтому годится в резерв; платим его цену только
 * тогда, когда основной не ответил.
 */
@Injectable()
export class FalImageService {
  private readonly logger = new Logger(FalImageService.name);

  constructor(private readonly config: ConfigService) {}

  /** Настроен ли резерв. Без ключа запасного пути просто нет. */
  get enabled(): boolean {
    return Boolean(this.config.get<string>('FAL_KEY'));
  }

  private key(): string {
    const key = this.config.get<string>('FAL_KEY');
    if (!key)
      throw new ServiceUnavailableException('FAL_KEY is not configured');
    return key;
  }

  private model(): string {
    return (
      this.config.get<string>('MOTIVATION_IMAGE_MODEL_FALLBACK') ||
      DEFAULT_MODEL
    );
  }

  /**
   * Картинка запасным поставщиком, всегда в PNG.
   *
   * Формат приводим сами: ниже по течению кадр кладётся в S3 под ключом
   * `.png`, и вернуть оттуда JPEG значило бы отдать файл, чьё расширение
   * врёт о содержимом.
   */
  async generate(prompt: string, size: string = IMAGE_SIZE): Promise<Buffer> {
    const model = this.model();
    const submitted = await fetch(`${QUEUE_BASE}/${model}`, {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        authorization: `Key ${this.key()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildFalImageRequest({ prompt, size })),
    });
    if (!submitted.ok)
      throw new BadGatewayException(
        `Fallback image provider error ${submitted.status}: ${(
          await submitted.text()
        ).slice(0, 300)}`,
      );
    const job = (await submitted.json().catch(() => null)) as {
      status_url?: string;
      response_url?: string;
    } | null;
    if (!job?.status_url || !job.response_url)
      throw new BadGatewayException('Fallback image provider returned no job');

    const url = await this.waitForImage(job.status_url, job.response_url);
    const file = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!file.ok)
      throw new BadGatewayException(
        `Fallback image download failed ${file.status}`,
      );
    const bytes = Buffer.from(await file.arrayBuffer());
    return sharp(bytes).png().toBuffer();
  }

  private async waitForImage(
    statusUrl: string,
    responseUrl: string,
  ): Promise<string> {
    const deadline = Date.now() + POLL_DEADLINE_MS;
    while (Date.now() < deadline) {
      const status = await fetch(statusUrl, {
        signal: AbortSignal.timeout(30_000),
        headers: { authorization: `Key ${this.key()}` },
      });
      if (!status.ok)
        throw new BadGatewayException(
          `Fallback image status error ${status.status}`,
        );
      const state = (await status.json().catch(() => null)) as {
        status?: string;
      } | null;
      if (state?.status === 'FAILED')
        throw new BadGatewayException('Fallback image provider failed');
      if (state?.status === 'COMPLETED') break;
      // IN_QUEUE и IN_PROGRESS — обычное ожидание, не ошибка.
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    const result = await fetch(responseUrl, {
      signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Key ${this.key()}` },
    });
    if (!result.ok)
      throw new BadGatewayException(
        `Fallback image result error ${result.status}`,
      );
    const url = parseFalImageUrl(await result.json().catch(() => null));
    if (!url)
      throw new BadGatewayException(
        'Fallback image provider returned no image',
      );
    this.logger.log(`Кадр получен запасным поставщиком (${this.model()})`);
    return url;
  }
}
