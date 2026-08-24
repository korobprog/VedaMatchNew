import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Observable, Subject, filter, map } from 'rxjs';
import type { ActivityStreamEvent } from '@vedamatch/shared';

/**
 * Доставка живых карточек ленты друзей подписчикам SSE. Устройство скопировано
 * с `ChatEventsService` (по контракту сервисного модуля хелперы дублируются
 * внутри модуля, а не импортируются из чужого): Redis для веерной рассылки
 * между инстансами API, если он настроен, тихая работа в его отсутствие.
 */
const CHANNEL_PREFIX = 'activity:user:';

interface Envelope {
  userId: string;
  event: ActivityStreamEvent;
}

@Injectable()
export class ActivityEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ActivityEventsService.name);
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
        'REDIS_HOST не задан — события ленты друзей не выходят за пределы процесса',
      );
      return;
    }
    try {
      await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
      await this.subscriber.psubscribe(`${CHANNEL_PREFIX}*`);
      this.subscriber.on('pmessage', (_pattern, channel, payload) => {
        const userId = channel.slice(CHANNEL_PREFIX.length);
        try {
          this.stream.next({
            userId,
            event: JSON.parse(payload) as ActivityStreamEvent,
          });
        } catch (error) {
          this.logger.warn(`Событие ленты не разобрано: ${String(error)}`);
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

  /** Разослать карточку тем, кому открыта активность автора. */
  publish(granteeIds: string[], event: ActivityStreamEvent): void {
    const unique = [...new Set(granteeIds)];
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

  /** Поток живых карточек одного человека — то, что подписывает SSE-контроллер. */
  streamFor(userId: string): Observable<ActivityStreamEvent> {
    return this.stream.pipe(
      filter((envelope) => envelope.userId === userId),
      map((envelope) => envelope.event),
    );
  }
}
