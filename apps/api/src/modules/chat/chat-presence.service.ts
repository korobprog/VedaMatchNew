import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const KEY_PREFIX = 'chat:viewing:';
/** Дольше — дольше держится ложное подавление после закрытия вкладки;
 *  короче — чаще лишний Redis-запрос при живом heartbeat. */
export const PRESENCE_TTL_MS = 25_000;

interface LocalEntry {
  conversationId: string;
  expiresAt: number;
}

/**
 * Реестр «кто сейчас смотрит в какую беседу» для подавления пушей
 * (`ChatMessagesService.notify()`). Тот же приём хранения, что уже
 * применён в `ChatEventsService`: Redis, если он настроен, иначе честная
 * работа в пределах одного процесса.
 */
@Injectable()
export class ChatPresenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatPresenceService.name);
  private readonly redis: Redis | null;
  private readonly local = new Map<string, LocalEntry>();

  constructor(private readonly config: ConfigService) {
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
    if (!this.redis) {
      this.logger.warn(
        'REDIS_HOST не задан — присутствие в чате не переживает несколько инстансов',
      );
      return;
    }
    try {
      await this.redis.connect();
    } catch (error) {
      this.logger.warn(`Redis недоступен: ${String(error)}`);
    }
  }

  async onModuleDestroy() {
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  /** Клиент подтвердил, что беседа открыта прямо сейчас. */
  async markViewing(userId: string, conversationId: string): Promise<void> {
    if (this.redis?.status === 'ready') {
      await this.redis
        .set(`${KEY_PREFIX}${userId}`, conversationId, 'PX', PRESENCE_TTL_MS)
        .catch((error) =>
          this.logger.warn(`Присутствие не записано: ${String(error)}`),
        );
      return;
    }
    this.local.set(userId, {
      conversationId,
      expiresAt: Date.now() + PRESENCE_TTL_MS,
    });
  }

  /** Смотрит ли человек именно в эту беседу прямо сейчас. */
  async isViewing(userId: string, conversationId: string): Promise<boolean> {
    if (this.redis?.status === 'ready') {
      const value = await this.redis
        .get(`${KEY_PREFIX}${userId}`)
        .catch(() => null);
      return value === conversationId;
    }
    const entry = this.local.get(userId);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.local.delete(userId);
      return false;
    }
    return entry.conversationId === conversationId;
  }
}
