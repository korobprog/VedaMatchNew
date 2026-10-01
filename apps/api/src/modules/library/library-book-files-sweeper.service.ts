import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { BOOK_KEY_PREFIX, orphanBookKeys } from './book-files';
import { LibraryBookStorageService } from './library-book-storage.service';

/** Раз в час — и не чаще во всём кластере: брошенные заливки не горят. */
const TICK_MS = 60 * 60_000;

/**
 * Сколько объектов уходит за один заход. Брошенного обычно единицы; предел —
 * на случай ошибки в отборе: она не должна вычистить бакет за один тик.
 */
const MAX_REMOVED_PER_TICK = 100;

/**
 * Уборка брошенных файлов книг.
 *
 * Файл льётся в бакет мимо API, а строка в базе появляется отдельным
 * запросом. Между ними рвётся сеть и закрываются вкладки, удаление объекта
 * тоже порой не проходит — и в бакете копятся сотни мегабайт, на которые
 * нет ссылки ни в базе, ни в админке.
 *
 * Устройство — как у `NotificationPurgeWorkerService`: тик по таймеру под
 * Redis-лизом, который доживает до своего срока и тем самым служит
 * расписанием. Без хранилища (локальная разработка) тик пустой.
 */
@Injectable()
export class LibraryBookFilesSweeperService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(LibraryBookFilesSweeperService.name);
  private readonly redis: Redis | null;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: LibraryBookStorageService,
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

  async tick(now = new Date()): Promise<void> {
    if (this.running || !this.storage.configured) return;
    this.running = true;
    try {
      if (!(await this.acquireLease())) return;
      const removed = await this.sweep(now);
      if (removed.length > 0)
        this.logger.log(
          `Уборка файлов книг: удалено ${removed.length} — ${removed.join(', ')}`,
        );
    } catch (error) {
      this.logger.error(
        'Тик уборки файлов книг упал',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  private async acquireLease(): Promise<boolean> {
    if (this.redis?.status !== 'ready') return true;
    const acquired = await this.redis
      .set('library:book-files:sweep:lease', '1', 'PX', TICK_MS, 'NX')
      .catch(() => null);
    return acquired !== null;
  }

  /**
   * Удаляет брошенные объекты и возвращает их ключи.
   *
   * Список строк читается после списка объектов: файл, прикреплённый, пока
   * шёл обход бакета, уже будет среди известных.
   */
  async sweep(now = new Date()): Promise<string[]> {
    const objects = await this.storage.list(BOOK_KEY_PREFIX);
    if (objects.length === 0) return [];
    const rows = await this.prisma.libraryEntryFile.findMany({
      select: { storageKey: true },
    });
    const known = new Set(rows.map((row) => row.storageKey));
    const orphans = orphanBookKeys(objects, known, now).slice(
      0,
      MAX_REMOVED_PER_TICK,
    );

    const removed: string[] = [];
    for (const key of orphans) {
      if (await this.storage.remove(key)) removed.push(key);
    }
    return removed;
  }
}
