import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { buildInboxPurgeWhere } from './inbox-retention';

/**
 * Раз в десять минут — и не чаще во всём кластере. Лента чистится от того,
 * что просрочено на неделю и на месяц: спешить тут некуда, а лишние удаления
 * с двух инстансов сразу не нужны никому.
 */
const TICK_MS = 10 * 60_000;

/**
 * Сколько строк уходит за один заход. Предел не ради базы (просроченного
 * обычно единицы), а ради разового случая: если чистка не работала неделю,
 * первый заход не должен превратиться в один `DELETE` на всю таблицу.
 */
const BATCH_SIZE = 500;

/** Сколько пакетов подряд за тик. Остаток догонит следующий. */
const MAX_BATCHES_PER_TICK = 20;

/**
 * Чистка ленты уведомлений (VED-267).
 *
 * Раньше это делал первый же `await` в `listInbox()`: человек, открывший
 * колокольчик, ждал удаления чужого мусора, и только потом получал свой
 * список. Заодно чистка и не срабатывала там, где нужнее всего, — у того, кто
 * на портал больше не заходит: запускал-то её сам читатель.
 *
 * Устройство — как у `NotificationBroadcastWorkerService` и
 * `MotivationWorkerService`: тик по таймеру под Redis-лизом, работа пакетами.
 * Отличие одно и намеренное: лиз не снимается в конце тика, а доживает до
 * своего срока. Здесь он не только взаимное исключение, но и расписание —
 * сколько бы инстансов API ни стояло, чистка проходит раз в интервал, а не
 * по разу на каждый. Без Redis (локальная разработка) воркер работает как
 * есть: инстанс один, делить лиз не с кем.
 */
@Injectable()
export class NotificationPurgeWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationPurgeWorkerService.name);
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

  async onModuleInit(): Promise<void> {
    if (this.redis)
      await this.redis
        .connect()
        .catch((error) =>
          this.logger.warn(`Redis unavailable: ${String(error)}`),
        );
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    // Первый заход сразу после старта: перезапуск API не должен откладывать
    // чистку на десять минут, а на пустой ленте этот заход стоит один запрос.
    void this.tick();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      if (!(await this.acquireLease())) return;
      const removed = await this.purge(now);
      if (removed > 0)
        this.logger.log(`Чистка ленты: удалено ${removed} уведомлений`);
    } catch (error) {
      this.logger.error(
        'Тик чистки уведомлений упал',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Лиз на весь интервал. Не взят — значит, чистку уже сделал (или делает)
   * другой инстанс, и этому тику делать нечего.
   */
  private async acquireLease(): Promise<boolean> {
    if (this.redis?.status !== 'ready') return true;
    const acquired = await this.redis
      .set('notifications:purge:lease', '1', 'PX', TICK_MS, 'NX')
      .catch(() => null);
    return acquired !== null;
  }

  /**
   * Удаляет просроченное пакетами и возвращает сколько удалил.
   *
   * Пакет отбирается `findMany`, удаляется по списку `id`. Один `deleteMany`
   * по условию был бы короче, но не ограничен: сколько строк он заденет,
   * заранее неизвестно.
   */
  async purge(now = new Date()): Promise<number> {
    const where = buildInboxPurgeWhere(now);
    let removed = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_TICK; batch += 1) {
      const rows = await this.prisma.notificationItem.findMany({
        where,
        select: { id: true },
        take: BATCH_SIZE,
      });
      if (rows.length === 0) break;
      const result = await this.prisma.notificationItem.deleteMany({
        where: { id: { in: rows.map((row) => row.id) } },
      });
      removed += result.count;
      if (rows.length < BATCH_SIZE) break;
    }
    return removed;
  }
}
