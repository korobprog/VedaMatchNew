import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ChatOfficialPostsService } from './chat-official-posts.service';

const TICK_MS = 30_000;
const LEASE_MS = 120_000;
/** Постов за тик: очередь маленькая, но и тик не должен тянуться минутами. */
const POSTS_PER_TICK = 10;

/**
 * Публикует очередь постов официального канала. Устроен как
 * MotivationWorkerService: тик раз в 30 секунд под Redis-лизом (`SET NX PX`),
 * клейм поста через `updateMany` с проверкой статуса, повторы по
 * `attemptCount` и возврат зависших по `updatedAt`
 * (`ChatOfficialPostsService.recoverStale`).
 */
@Injectable()
export class ChatOfficialPostWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ChatOfficialPostWorkerService.name);
  private readonly redis: Redis | null;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly posts: ChatOfficialPostsService,
    config: ConfigService,
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

  async onModuleInit(): Promise<void> {
    if (this.redis)
      await this.redis
        .connect()
        .catch((error) =>
          this.logger.warn(`Redis unavailable: ${String(error)}`),
        );
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const lockKey = 'chat:official-posts:lease';
    const token = crypto.randomUUID();
    if (this.redis?.status === 'ready') {
      const acquired = await this.redis
        .set(lockKey, token, 'PX', LEASE_MS, 'NX')
        .catch(() => null);
      if (!acquired) {
        this.running = false;
        return;
      }
    }
    try {
      await this.posts.recoverStale();
      for (let i = 0; i < POSTS_PER_TICK; i += 1)
        if (!(await this.posts.publishNext())) break;
    } catch (error) {
      this.logger.error(
        'Тик постов официального канала упал',
        error instanceof Error ? error.stack : String(error),
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
}
