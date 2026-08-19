import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MotivationVideoStatus } from '@prisma/client';
import Redis from 'ioredis';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { FalAudioService } from './fal-audio.service';
import { FalVideoService } from './fal-video.service';
import { MotivationGenerationService } from './motivation-generation.service';
import { resolveVideoPrompt } from './motivation-prompt';
import { STORY_HEIGHT, STORY_WIDTH } from './story-image';
import { composeStoryVideo, estimateReadingSeconds } from './story-video';
import { estimatePlannedClipUsd } from './video-cost';
import { BUDGET_CODE_PREFIX } from './funding-error';

/**
 * Попыток меньше, чем у картинки, и это осознанно: провайдер берёт деньги даже
 * за запрос, который сам же не смог разобрать. На живой проверке такой запрос
 * стоил $2.50 — вдесятеро дороже удачного ролика. Три попытки на застрявшем
 * посте превращались бы в $7.50.
 */
export const MAX_VIDEO_ATTEMPTS = 2;

/** Ошибки, которые не лечатся повтором: с тем же входом выйдет то же самое. */
export const PERMANENT_FAILURES = new Set([
  'file_download_error',
  'missing',
  'no_video_in_response',
]);

/** Превышение потолка — не сбой задачи: повторять будем, но не сейчас. */
/**
 * Префикс кода «упёрлись в дневной потолок». Значение живёт в `funding-error`
 * вместе с разбором таких кодов: расходиться им нельзя — по этому же префиксу
 * автору показывается просьба о поддержке.
 */
export const BUDGET_PREFIX = BUDGET_CODE_PREFIX;

@Injectable()
export class MotivationVideoWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MotivationVideoWorkerService.name);
  private readonly redis: Redis | null;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fal: FalVideoService,
    private readonly voice: FalAudioService,
    private readonly generation: MotivationGenerationService,
    private readonly config: ConfigService,
  ) {
    const host = config.get<string>('REDIS_HOST');
    this.redis = host
      ? new Redis({
          host,
          port: Number(config.get('REDIS_PORT') || 6379),
          db: Number(config.get('REDIS_DB') || 0),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        })
      : null;
  }

  async onModuleInit() {
    if (!this.fal.enabled) {
      this.logger.log('FAL_KEY не задан — стадия видео выключена');
      return;
    }
    if (this.redis)
      await this.redis
        .connect()
        .catch((error) =>
          this.logger.warn(`Redis unavailable: ${String(error)}`),
        );
    this.timer = setInterval(() => void this.tick(), 30_000);
    this.timer.unref();
    void this.tick();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    const lockKey = 'motivation:video-worker:lease';
    const token = crypto.randomUUID();
    if (this.redis?.status === 'ready') {
      // Аренда длиннее, чем у картинки: ролик генерируется минутами, и
      // короткий лиз отдал бы задачу второму процессу до её конца.
      const acquired = await this.redis
        .set(lockKey, token, 'PX', 900_000, 'NX')
        .catch(() => null);
      if (!acquired) {
        this.running = false;
        return;
      }
    }
    try {
      await this.recoverExpiredJobs();
      // Сначала дочитываем начатое: поллинг бесплатен, а постановка новой
      // задачи стоит денег. При заторе выгоднее довести до конца текущее.
      const polled = await this.pollRunning();
      if (!polled) await this.startQueued();
    } catch (error) {
      this.logger.error(
        'Motivation video worker tick failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      if (this.redis?.status === 'ready')
        await this.redis
          .eval(
            "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
            1,
            lockKey,
            token,
          )
          .catch(() => undefined);
      this.running = false;
    }
  }

  /** Дневной потолок расхода. Без явной настройки берём осторожные $5. */
  private dailyBudgetUsd(): number {
    const raw = Number(this.config.get('MOTIVATION_AI_DAILY_BUDGET_USD'));
    return Number.isFinite(raw) && raw > 0 ? raw : 5;
  }

  /**
   * Не даёт превысить дневной расход.
   *
   * Считаем по сумме `videoCostUsd` и `estimatedCostUsd` за сегодня. Оценка снизу: при повторе поле
   * поста перезаписывается, и неудачная первая попытка в сумму не попадёт.
   * Точный учёт потребовал бы отдельной таблицы списаний — пока кнопка только
   * у администратора, этой точности хватает, но до открытия пользователям
   * счётчик надо будет сделать честным.
   */
  private async assertWithinBudget(): Promise<void> {
    const since = new Date(
      `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
    );
    const spent = await this.prisma.motivationPost.aggregate({
      _sum: { videoCostUsd: true, estimatedCostUsd: true },
      where: { updatedAt: { gte: since } },
    });
    // Кадры считаются вместе с роликами: платим за них с того же счёта, и
    // потолок, стерегущий только видео, пропускал бы половину расхода.
    const used =
      Number(spent._sum.videoCostUsd ?? 0) +
      Number(spent._sum.estimatedCostUsd ?? 0);
    const planned = estimatePlannedClipUsd({
      seconds: await this.fal.durationSeconds(),
      model: await this.fal.modelId(),
    });
    const limit = this.dailyBudgetUsd();
    if (used + planned > limit)
      throw new Error(
        `daily_budget_exceeded_${used.toFixed(2)}_of_${limit.toFixed(2)}`,
      );
  }

  /** Задача, висящая у провайдера дольше получаса, считается потерянной. */
  private async recoverExpiredJobs() {
    const expiredAt = new Date(Date.now() - 30 * 60_000);
    await this.prisma.motivationPost.updateMany({
      where: {
        videoStatus: MotivationVideoStatus.running,
        updatedAt: { lt: expiredAt },
      },
      data: {
        videoStatus: MotivationVideoStatus.failed,
        videoErrorCode: 'provider_timeout',
      },
    });
  }

  private async startQueued(): Promise<void> {
    const post = await this.prisma.motivationPost.findFirst({
      where: {
        videoStatus: MotivationVideoStatus.queued,
        imageUrl: { not: null },
        videoAttemptCount: { lt: MAX_VIDEO_ATTEMPTS },
      },
      orderBy: { updatedAt: 'asc' },
    });
    // Промпт иллюстрации здесь больше не нужен: у ролика своё описание
    // движения, а при пустом поле подставляется дефолт.
    if (!post?.imageUrl) return;

    const claimed = await this.prisma.motivationPost.updateMany({
      where: { id: post.id, videoStatus: MotivationVideoStatus.queued },
      data: {
        videoStatus: MotivationVideoStatus.running,
        videoAttemptCount: { increment: 1 },
        videoErrorCode: null,
      },
    });
    if (!claimed.count) return;

    try {
      // Потолок расхода проверяется до отправки, а не после: списание
      // происходит уже в момент постановки задачи, отменить его нельзя.
      await this.assertWithinBudget();

      const frame = await this.prepareFrame(post.imageUrl);
      // Кадр обязательно перекладываем в хранилище провайдера: прямую ссылку
      // на наш S3 он не осиливает — тянул её 99 секунд и сдался с
      // file_download_error, хотя снаружи она отдаётся мгновенно.
      const imageUrl = await this.fal.upload(frame);
      const job = await this.fal.submit({
        imageUrl,
        // Именно videoPrompt, а не imagePrompt: промпт картинки описывает
        // статичную сцену, и видеомодель понимает его как «повтори этот кадр»
        // — на выходе получался застывший ролик. Модели нужно сказать, что
        // движется и как.
        prompt: resolveVideoPrompt(post.videoPrompt),
      });
      await this.prisma.motivationPost.updateMany({
        where: { id: post.id, videoStatus: MotivationVideoStatus.running },
        data: {
          videoJobId: job.requestId,
          videoJobStatusUrl: job.statusUrl,
          videoJobResultUrl: job.responseUrl,
        },
      });
      this.logger.log(
        `Видео поставлено в очередь: ${post.slug} (${job.requestId})`,
      );
    } catch (error) {
      await this.fail(post.id, error);
    }
  }

  /**
   * Кадр для модели: 9:16 и JPEG.
   *
   * Иллюстрация приходит 2:3, а сторис нужен 9:16 — без докадрирования ролик
   * лёг бы с полями. JPEG вместо PNG срезает вес с 2.82 МБ до 0.43: провайдеру
   * меньше тянуть, а именно на скачивании он и спотыкался.
   */
  private async prepareFrame(imageUrl: string): Promise<Buffer> {
    const source = await fetch(imageUrl, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!source.ok)
      throw new Error(`source_image_unavailable_${source.status}`);
    return sharp(Buffer.from(await source.arrayBuffer()))
      .resize(STORY_WIDTH, STORY_HEIGHT, {
        fit: 'cover',
        position: 'attention',
      })
      .jpeg({ quality: 88 })
      .toBuffer();
  }

  /** @returns true, если в этом тике было что опрашивать. */
  private async pollRunning(): Promise<boolean> {
    const post = await this.prisma.motivationPost.findFirst({
      where: {
        videoStatus: MotivationVideoStatus.running,
        videoJobStatusUrl: { not: null },
        videoJobResultUrl: { not: null },
      },
      orderBy: { updatedAt: 'asc' },
      include: {
        translations: { where: { language: 'ru' }, take: 1 },
        quote: true,
      },
    });
    if (!post?.videoJobStatusUrl || !post.videoJobResultUrl) return false;

    try {
      const result = await this.fal.poll({
        statusUrl: post.videoJobStatusUrl,
        responseUrl: post.videoJobResultUrl,
      });
      if (result.state === 'running') return true;
      if (result.state === 'failed') {
        await this.fail(post.id, new Error(result.reason));
        return true;
      }

      const raw = await this.fal.download(result.videoUrl);
      const withCaption = await this.withCaption(post, raw);
      const version = Date.now();
      const key = `motivation/${post.contentDate
        .toISOString()
        .slice(0, 10)}/${post.id}/v${version}-video.mp4`;
      const videoUrl = await this.generation.uploadStory(
        key,
        withCaption,
        'video/mp4',
      );
      await this.prisma.motivationPost.updateMany({
        where: { id: post.id, videoStatus: MotivationVideoStatus.running },
        data: {
          videoStatus: MotivationVideoStatus.review,
          videoUrl,
          videoErrorCode: null,
          // Провайдер не возвращает списанную сумму, поэтому пишем свою
          // оценку по его же формуле — иначе учёт расхода остался бы нулём.
          videoCostUsd: estimatePlannedClipUsd({
            seconds: await this.fal.durationSeconds(),
            model: await this.fal.modelId(),
          }),
        },
      });
      this.logger.log(`Видео готово к проверке: ${post.slug}`);
      return true;
    } catch (error) {
      await this.fail(post.id, error);
      return true;
    }
  }

  /**
   * Подпись на ролике. Если наложить не удалось — отдаём ролик без неё:
   * генерация уже оплачена, терять её из-за подписи нельзя. Сбой при этом
   * пишется ошибкой в лог — иначе пропавший в образе ffmpeg молча выдавал бы
   * ролики без единого слова, ровно ту беду, ради которой всё и делалось.
   */
  private async withCaption(
    post: {
      storyCaption: boolean;
      translations: Array<{ storyText: string }>;
      quote: {
        originalText: string;
        author: string;
        work: string;
        locator: string;
      } | null;
      attributionSpeaker: string | null;
      attributionWork: string | null;
      attributionLocator: string | null;
      videoVoice: boolean;
      videoSeconds: number | null;
      videoVoiceName: string | null;
      videoTrack?: { url: string } | null;
    },
    video: Buffer,
  ): Promise<Buffer> {
    if (!post.storyCaption) return video;
    const text =
      post.translations[0]?.storyText?.trim() ||
      post.quote?.originalText?.trim();
    if (!text) return video;

    const attribution = [
      post.quote?.author ?? post.attributionSpeaker,
      post.quote?.work ?? post.attributionWork,
      post.quote?.locator ?? post.attributionLocator,
    ]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' · ');

    try {
      // Озвучка задаёт длину: ролик у модели пять секунд, за них четыре строки
      // не прочитать и не прослушать. Добираем повтором — растягивать саму
      // генерацию втрое дороже.
      const spoken = post.videoVoice
        ? await this.speak(text, attribution, post.videoVoiceName)
        : undefined;
      const seconds =
        post.videoSeconds ??
        (spoken
          ? Math.ceil(spoken.seconds + 1)
          : estimateReadingSeconds(text, attribution));

      // Музыка необязательна и не должна ронять ролик: не скачалась — соберём
      // без неё, это лучше, чем потерять уже оплаченную генерацию.
      const music = post.videoTrack?.url
        ? await this.download(post.videoTrack.url)
        : undefined;

      return await composeStoryVideo(
        video,
        { text, attribution },
        { loopToSeconds: seconds, voice: spoken?.audio, music },
      );
    } catch (error) {
      this.logger.error(
        `Не удалось наложить подпись на ролик: ${String(error)}`,
      );
      return video;
    }
  }

  /** Файл подложки. Ошибку глотаем: ролик важнее музыки. */
  private async download(url: string): Promise<Buffer | undefined> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`music_${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      this.logger.warn(`Не удалось получить музыку: ${String(error)}`);
      return undefined;
    }
  }

  /**
   * Озвучка цитаты. Сбой здесь не должен губить ролик: он уже оплачен, а без
   * голоса пост остаётся рабочим — просто немым.
   */
  private async speak(
    text: string,
    attribution: string,
    voice: string | null,
  ): Promise<{ audio: Buffer; seconds: number } | undefined> {
    if (!this.voice.enabled) return undefined;
    // Атрибуцию читаем следом за цитатой: иначе слушатель не узнает, чьи это
    // слова, а на кадре подпись мелкая.
    const line = attribution ? `${text} ${attribution}` : text;
    try {
      return await this.voice.speak(line, voice);
    } catch (error) {
      this.logger.error(`Не удалось озвучить цитату: ${String(error)}`);
      return undefined;
    }
  }

  private async fail(id: string, error: unknown): Promise<void> {
    const code =
      error instanceof Error ? error.message.slice(0, 200) : 'video_failed';

    // Упёрлись в потолок — не вина задачи. Возвращаем в очередь и снимаем
    // израсходованную попытку: иначе за пару дней подряд у поста кончились бы
    // попытки, хотя провайдера мы так и не побеспокоили.
    if (code.startsWith(BUDGET_PREFIX)) {
      await this.prisma.motivationPost.updateMany({
        where: { id, videoStatus: MotivationVideoStatus.running },
        data: {
          videoStatus: MotivationVideoStatus.queued,
          videoErrorCode: code,
          videoAttemptCount: { decrement: 1 },
        },
      });
      this.logger.warn(`Дневной потолок расхода достигнут: ${code}`);
      return;
    }

    const current = await this.prisma.motivationPost.findUnique({
      where: { id },
      select: { videoAttemptCount: true },
    });
    const retryable =
      !PERMANENT_FAILURES.has(code) &&
      (current?.videoAttemptCount ?? 0) < MAX_VIDEO_ATTEMPTS;
    await this.prisma.motivationPost.updateMany({
      where: { id, videoStatus: MotivationVideoStatus.running },
      data: {
        videoStatus: retryable
          ? MotivationVideoStatus.queued
          : MotivationVideoStatus.failed,
        videoErrorCode: code,
        // Ссылки на задачу сбрасываем: повтор поставит новую, а старые сбили
        // бы поллинг на чужой результат.
        videoJobId: null,
        videoJobStatusUrl: null,
        videoJobResultUrl: null,
      },
    });
    this.logger.error(`Видео не получилось (${code}), повтор: ${retryable}`);
  }
}
