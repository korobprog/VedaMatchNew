import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Перевод протухших объявлений в `expired`.
 *
 * `@nestjs/schedule` в проекте нет: фоновая работа делается таймером по
 * образцу motivation-worker.service.ts и astro-transit-worker.service.ts.
 *
 * Важно: корректность выдачи на воркер НЕ завязана. Условие
 * `expiresAt > now` входит в тот же `where`, из которого строится лента
 * (см. notice-feed-query.ts), поэтому остановленный воркер оставит
 * устаревшие счётчики рубрик, но мёртвое объявление в ленту не пустит.
 */
const TICK_MS = 5 * 60_000;
/** Ключ аренды: на нескольких инстансах тик должен делать кто-то один. */
const LOCK_KEY = 'notices:expiry:lock';
const LOCK_TTL_MS = TICK_MS - 30_000;

@Injectable()
export class NoticesWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NoticesWorkerService.name);
  private readonly redis: Redis | null;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
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

  async onModuleInit() {
    if (this.redis)
      await this.redis
        .connect()
        .catch((error) =>
          this.logger.warn(`Redis unavailable: ${String(error)}`),
        );
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    // unref, иначе таймер держит процесс и тесты не завершаются.
    this.timer.unref();
    void this.tick();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      if (!(await this.acquireLock())) return 0;
      const now = new Date();
      // Без Redis два инстанса сделают один и тот же updateMany — операция
      // идемпотентна, поэтому это безвредно, просто лишняя работа.
      const { count } = await this.prisma.notice.updateMany({
        where: { status: 'published', expiresAt: { lte: now } },
        data: { status: 'expired' },
      });
      if (count > 0) {
        this.logger.log(`Протухло объявлений: ${count}`);
        await this.recountRubrics(now);
      }
      return count;
    } catch (error) {
      this.logger.error(`Тик протухания не прошёл: ${String(error)}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async acquireLock(): Promise<boolean> {
    if (!this.redis || this.redis.status !== 'ready') return true;
    const token = await this.redis.set(
      LOCK_KEY,
      String(process.pid),
      'PX',
      LOCK_TTL_MS,
      'NX',
    );
    return token === 'OK';
  }

  /**
   * Счётчики рубрик освежаются одним проходом, а не инкрементом на каждую
   * протухшую запись: так они не расходятся с лентой после любого сбоя.
   */
  private async recountRubrics(now: Date) {
    const counts = await this.prisma.notice.groupBy({
      by: ['rubricId'],
      where: { status: 'published', expiresAt: { gt: now } },
      _count: { _all: true },
    });
    const byId = new Map(counts.map((row) => [row.rubricId, row._count._all]));
    const rubrics = await this.prisma.noticeRubric.findMany({
      select: { id: true, noticesCount: true },
    });
    for (const rubric of rubrics) {
      const actual = byId.get(rubric.id) ?? 0;
      if (actual !== rubric.noticesCount)
        await this.prisma.noticeRubric.update({
          where: { id: rubric.id },
          data: { noticesCount: actual },
        });
    }
  }
}
