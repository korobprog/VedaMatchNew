import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { WorkPayoutsService } from './work-payouts.service';

/** Раз в пять минут: день подбития — дата, а не минута, спешить некуда. */
const TICK_MS = 5 * 60_000;
const LEASE_KEY = 'work:payouts:lease';
const LEASE_MS = 4 * 60_000;

/**
 * Подбитие периодов выплат (VED-460), когда день подбития прошёл.
 *
 * Устройство повторяет `WorkNoticeWorkerService` и `MotivationWorkerService`:
 * тик под Redis-лизом, чтобы два инстанса API не подбивали одно и то же.
 * Второй рубеж — уникальность (доска, начало периода) в базе: даже без Redis
 * двойного подбития не будет, второй получит отказ и ничего не изменит.
 */
@Injectable()
export class WorkPayoutWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkPayoutWorkerService.name);
  private readonly redis: Redis | null;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly payouts: WorkPayoutsService,
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
          this.logger.warn(`Redis недоступен: ${String(error)}`),
        );
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    // Первый проход — вскоре после старта: выкладка не должна откладывать
    // подбитие на целый интервал.
    setTimeout(() => void this.tick(), 20_000).unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    const token = crypto.randomUUID();
    let leased = false;
    try {
      if (this.redis?.status === 'ready') {
        const acquired = await this.redis
          .set(LEASE_KEY, token, 'PX', LEASE_MS, 'NX')
          .catch(() => null);
        if (!acquired) return;
        leased = true;
      }
      const closed = await this.payouts.closeDue(now);
      if (closed > 0) this.logger.log(`Подбито периодов выплат: ${closed}`);
    } catch (error) {
      this.logger.error(
        'Подбитие периодов выплат не удалось',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      // Отпускаем лиз, только если он ещё наш: после выкладки новый инстанс
      // не должен ждать, пока истечёт лиз ушедшего.
      if (leased) {
        const holder = await this.redis?.get(LEASE_KEY).catch(() => null);
        if (holder === token) await this.redis?.del(LEASE_KEY).catch(() => 0);
      }
      this.running = false;
    }
  }
}
