import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import {
  backfillThumbKey,
  backfillWebKey,
  MAX_THUMB_ATTEMPTS,
  THUMB_RETRY_PAUSE_MS,
} from './image-thumb';
import { MotivationImageThumbService } from './motivation-image-thumb.service';

/** Сколько постов за тик: десяток скачиваний по паре мегабайт — секунды. */
export const THUMB_BATCH = 10;

const FETCH_TIMEOUT_MS = 30_000;

export interface ThumbBatchResult {
  done: number;
  failed: number;
  skipped: number;
}

interface ThumbCandidate {
  id: string;
  imageUrl: string | null;
  /** Сколько попыток уже потрачено на копию этого прохода. */
  attempts: number;
  updatedAt: Date;
}

/**
 * Описание прохода бэкфилла: какие поля поста он ведёт и чем делает копию.
 * Превью и web-копия устроены одинаково и различаются только этим.
 */
interface BackfillPass {
  label: string;
  url: 'imageThumbUrl' | 'imageWebUrl';
  attempts: 'imageThumbAttempts' | 'imageWebAttempts';
  attemptAt: 'imageThumbAttemptAt' | 'imageWebAttemptAt';
  key: typeof backfillThumbKey;
  upload: (
    thumbs: MotivationImageThumbService,
    key: string,
    bytes: Buffer,
  ) => Promise<string>;
}

const THUMB_PASS: BackfillPass = {
  label: 'thumb',
  url: 'imageThumbUrl',
  attempts: 'imageThumbAttempts',
  attemptAt: 'imageThumbAttemptAt',
  key: backfillThumbKey,
  upload: (thumbs, key, bytes) => thumbs.upload(key, bytes),
};

const WEB_PASS: BackfillPass = {
  label: 'web copy',
  url: 'imageWebUrl',
  attempts: 'imageWebAttempts',
  attemptAt: 'imageWebAttemptAt',
  key: backfillWebKey,
  upload: (thumbs, key, bytes) => thumbs.uploadWeb(key, bytes),
};

/**
 * Бэкфилл лёгких копий иллюстраций (VED-629).
 *
 * Новые картинки получают копию сразу при появлении; эта стадия доделывает
 * старые посты и те, где копия тогда не получилась. Устройство — как у
 * `MotivationWorkerService`: тик раз в 30 с под лизом в Redis, клейм через
 * `updateMany` с проверкой состояния, ограниченное число попыток.
 *
 * `updatedAt` поста стадия не трогает — ни при клейме, ни при записи. По нему
 * работают чужие стадии: дневной потолок расхода суммирует стоимость постов,
 * изменённых сегодня, а восстановление зависших генераций смотрит на его
 * возраст. Пережатая копия — не правка поста, и старые посты, пройдя
 * бэкфилл, не должны разом «потратить» сегодняшний бюджет.
 */
@Injectable()
export class MotivationThumbWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MotivationThumbWorkerService.name);
  private readonly redis: Redis | null;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly thumbs: MotivationImageThumbService,
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
    if (!this.publicBase()) {
      this.logger.log('S3_PUBLIC_URL не задан — бэкфилл копий выключен');
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
    const lockKey = 'motivation:thumb-worker:lease';
    const token = crypto.randomUUID();
    if (this.redis?.status === 'ready') {
      const acquired = await this.redis
        .set(lockKey, token, 'PX', 300_000, 'NX')
        .catch(() => null);
      if (!acquired) {
        this.running = false;
        return;
      }
    }
    try {
      await this.runBatch();
      // Web-копии — после превью: превью нужнее (им пользуются слайды
      // викторины), и сбой одной пачки не должен мешать другой.
      await this.runWebBatch();
    } catch (error) {
      this.logger.error(
        'Motivation thumb worker tick failed',
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

  /**
   * Одна пачка превью. Пост без копии берётся, пока не кончились попытки и с
   * прошлой прошла пауза: отметка ставится при клейме, так что пост,
   * брошенный упавшим процессом, сам вернётся в очередь по её истечении.
   */
  runBatch(now = new Date()): Promise<ThumbBatchResult> {
    return this.runPass(THUMB_PASS, now);
  }

  /**
   * Одна пачка web-копий: те же правила, что у превью, но свои поля попыток —
   * неудача одной копии не отнимает попытки у другой.
   */
  runWebBatch(now = new Date()): Promise<ThumbBatchResult> {
    return this.runPass(WEB_PASS, now);
  }

  private async runPass(
    pass: BackfillPass,
    now: Date,
  ): Promise<ThumbBatchResult> {
    const result: ThumbBatchResult = { done: 0, failed: 0, skipped: 0 };
    const base = this.publicBase();
    if (!base) return result;
    const posts = (await this.prisma.motivationPost.findMany({
      where: {
        imageUrl: { not: null },
        [pass.url]: null,
        [pass.attempts]: { lt: MAX_THUMB_ATTEMPTS },
        OR: [
          { [pass.attemptAt]: null },
          {
            [pass.attemptAt]: {
              lt: new Date(now.getTime() - THUMB_RETRY_PAUSE_MS),
            },
          },
        ],
      },
      // Сначала свежие опубликованные: их прямо сейчас смотрят лента и
      // викторина.
      orderBy: [
        { publishedAt: { sort: 'desc', nulls: 'last' } },
        { id: 'asc' },
      ],
      take: THUMB_BATCH,
      select: {
        id: true,
        imageUrl: true,
        [pass.attempts]: true,
        updatedAt: true,
      },
    })) as unknown as Array<Record<string, unknown>>;
    for (const row of posts) {
      const post: ThumbCandidate = {
        id: row.id as string,
        imageUrl: row.imageUrl as string | null,
        attempts: row[pass.attempts] as number,
        updatedAt: row.updatedAt as Date,
      };
      const outcome = await this.process(pass, post, base, now);
      result[outcome] += 1;
    }
    return result;
  }

  private async process(
    pass: BackfillPass,
    post: ThumbCandidate,
    base: string,
    now: Date,
  ): Promise<keyof ThumbBatchResult> {
    const imageUrl = post.imageUrl;
    if (!imageUrl) return 'skipped';
    const claimed = await this.prisma.motivationPost.updateMany({
      where: {
        id: post.id,
        imageUrl,
        [pass.url]: null,
        [pass.attempts]: post.attempts,
        updatedAt: post.updatedAt,
      },
      data: {
        [pass.attempts]: { increment: 1 },
        [pass.attemptAt]: now,
        updatedAt: post.updatedAt,
      },
    });
    if (!claimed.count) return 'skipped';
    try {
      const response = await fetch(imageUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok)
        throw new Error(`image fetch failed: ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      const copyUrl = await pass.upload(
        this.thumbs,
        pass.key(imageUrl, base, post.id, now.getTime()),
        bytes,
      );
      return (await this.writeCopy(pass, post.id, imageUrl, copyUrl))
        ? 'done'
        : 'skipped';
    } catch (error) {
      this.logger.warn(
        `Unable to backfill image ${pass.label} for ${post.id} (attempt ${
          post.attempts + 1
        }/${MAX_THUMB_ATTEMPTS}): ${String(error)}`,
      );
      return 'failed';
    }
  }

  /**
   * Пишет копию, не сдвигая `updatedAt`. Условие на `updatedAt` делает запись
   * точной: если пост между чтением и записью поменяли, перечитываем и
   * пробуем снова. Сменилась сама картинка — копия уже не её, не пишем.
   */
  private async writeCopy(
    pass: BackfillPass,
    id: string,
    imageUrl: string,
    copyUrl: string,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const row = (await this.prisma.motivationPost.findUnique({
        where: { id },
        select: { imageUrl: true, [pass.url]: true, updatedAt: true },
      })) as unknown as Record<string, unknown> | null;
      if (!row || row.imageUrl !== imageUrl || row[pass.url]) return false;
      const rowUpdatedAt = row.updatedAt as Date;
      const written = await this.prisma.motivationPost.updateMany({
        where: {
          id,
          imageUrl,
          [pass.url]: null,
          updatedAt: rowUpdatedAt,
        },
        data: { [pass.url]: copyUrl, updatedAt: rowUpdatedAt },
      });
      if (written.count) return true;
    }
    return false;
  }

  private publicBase(): string {
    return this.config.get<string>('S3_PUBLIC_URL')?.trim() ?? '';
  }
}
