import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Observable, Subject, filter, map } from 'rxjs';
import type { ChatStreamEvent } from '@vedamatch/shared';

/**
 * Доставка событий чата подписчикам SSE.
 *
 * Схема как у воркера Мотивации: Redis, если он настроен, и тихая работа
 * без него в локальной разработке. Разница в назначении — там лиз на
 * единственного исполнителя, здесь веерная рассылка: событие, рождённое на
 * одном инстансе API, обязано долететь до потоков, которые держит другой.
 *
 * Без Redis всё остаётся внутри процесса. Это честное поведение для одного
 * инстанса и не притворяется кластером: второй контейнер без Redis просто не
 * увидит чужих событий, о чём предупреждает лог при старте.
 */
const CHANNEL_PREFIX = 'chat:user:';

interface Envelope {
  userId: string;
  event: ChatStreamEvent;
}

@Injectable()
export class ChatEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatEventsService.name);
  /** Локальная шина: в неё приходит и своё, и прилетевшее из Redis. */
  private readonly stream = new Subject<Envelope>();
  private readonly publisher: Redis | null;
  private readonly subscriber: Redis | null;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('REDIS_HOST');
    this.publisher = host ? this.createClient(config) : null;
    this.subscriber = host ? this.createClient(config) : null;
  }

  private createClient(config: ConfigService): Redis {
    return new Redis({
      host: config.get<string>('REDIS_HOST'),
      port: Number(config.get('REDIS_PORT') || 6379),
      db: Number(config.get('REDIS_DB') || 0),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  async onModuleInit() {
    if (!this.subscriber || !this.publisher) {
      this.logger.warn(
        'REDIS_HOST не задан — события чата не выходят за пределы процесса',
      );
      return;
    }
    try {
      await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
      // Один шаблон вместо подписки на канал каждого онлайн-пользователя:
      // держать тысячи подписок ради выборки по id незачем.
      await this.subscriber.psubscribe(`${CHANNEL_PREFIX}*`);
      this.subscriber.on('pmessage', (_pattern, channel, payload) => {
        const userId = channel.slice(CHANNEL_PREFIX.length);
        try {
          this.stream.next({
            userId,
            event: JSON.parse(payload) as ChatStreamEvent,
          });
        } catch (error) {
          this.logger.warn(`Событие чата не разобрано: ${String(error)}`);
        }
      });
    } catch (error) {
      this.logger.warn(`Redis недоступен: ${String(error)}`);
    }
  }

  async onModuleDestroy() {
    this.stream.complete();
    if (this.publisher?.status === 'ready') await this.publisher.quit();
    if (this.subscriber?.status === 'ready') await this.subscriber.quit();
  }

  /**
   * Разослать событие перечисленным людям. Автор действия тоже в списке:
   * у него может быть открыт второй вкладкой тот же чат.
   */
  publish(userIds: string[], event: ChatStreamEvent): void {
    const unique = [...new Set(userIds)];
    if (this.publisher?.status === 'ready') {
      const payload = JSON.stringify(event);
      for (const userId of unique)
        void this.publisher
          .publish(`${CHANNEL_PREFIX}${userId}`, payload)
          .catch((error) =>
            this.logger.warn(`Событие не отправлено: ${String(error)}`),
          );
      return;
    }
    for (const userId of unique) this.stream.next({ userId, event });
  }

  /** Поток событий одного человека — то, что подписывает SSE-контроллер. */
  streamFor(userId: string): Observable<ChatStreamEvent> {
    return this.stream.pipe(
      filter((envelope) => envelope.userId === userId),
      map((envelope) => envelope.event),
    );
  }
}
