import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { orphanStorageKeys } from './chat-purge';
import { retentionCutoff, retentionDays } from './chat-retention';
import { ChatUploadsService } from './chat-uploads.service';

/**
 * Чистка удалённых сообщений: тело, вложения, реакции и файлы в S3.
 *
 * Строка сообщения остаётся — на неё ссылаются цитаты, и её место в переписке
 * видно как «сообщение удалено». Уходит только содержимое, которое до сих пор
 * лежало в базе и бакете бессрочно.
 *
 * Устройство скопировано с MotivationWorkerService — единственного образца
 * фоновой работы в портале: тик по таймеру, лиз в Redis (`SET NX PX`), чтобы
 * два инстанса API не чистили одно и то же, и тихая работа без Redis для
 * одного контейнера и локальной разработки.
 */
const LEASE_KEY = 'chat:retention:lease';
/** Лиз заметно длиннее тика: чистка пачки может затянуться на удалении файлов. */
const LEASE_MS = 10 * 60_000;
const TICK_MS = 15 * 60_000;
/**
 * Сколько сообщений за тик. Пачками, а не «всё сразу»: на первом запуске
 * накопленного может быть много, а удаление файлов идёт по одному объекту.
 */
const BATCH = 500;

@Injectable()
export class ChatRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatRetentionService.name);
  private readonly redis: Redis | null;
  private readonly days: number;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: ChatUploadsService,
    config: ConfigService,
  ) {
    this.days = retentionDays(
      config.get<string>('CHAT_DELETED_RETENTION_DAYS'),
    );
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
          this.logger.warn(`Redis недоступен: ${String(error)}`),
        );
    this.logger.log(`Удалённые сообщения чистятся через ${this.days} дн.`);
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    // unref, иначе таймер держит процесс и тесты не завершаются.
    this.timer.unref();
    void this.tick();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  async tick(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    if (this.redis?.status === 'ready') {
      const acquired = await this.redis
        .set(LEASE_KEY, randomUUID(), 'PX', LEASE_MS, 'NX')
        .catch(() => null);
      if (!acquired) {
        this.running = false;
        return 0;
      }
    }
    try {
      return await this.purge(retentionCutoff(now, this.days));
    } catch (error) {
      this.logger.error(
        'Чистка удалённых сообщений не удалась',
        error instanceof Error ? error.stack : undefined,
      );
      return 0;
    } finally {
      this.running = false;
    }
  }

  /**
   * Одна пачка. Уже вычищенные сообщения в выборку не попадают — иначе
   * чистка каждый тик перебирала бы всю историю удалений заново.
   */
  private async purge(cutoff: Date): Promise<number> {
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        deletedAt: { lt: cutoff },
        OR: [{ body: { not: '' } }, { attachments: { some: {} } }],
      },
      select: { id: true, attachments: { select: { key: true } } },
      orderBy: { deletedAt: 'asc' },
      take: BATCH,
    });
    if (messages.length === 0) return 0;

    const ids = messages.map((message) => message.id);
    const keys = messages
      .flatMap((message) => message.attachments.map((a) => a.key))
      .filter((key): key is string => Boolean(key));

    // Пересылка копирует вложение вместе с ключом: объект в бакете один на
    // оригинал и все копии. Удалять его можно, только когда на него не
    // ссылается ни одно уцелевшее сообщение — тот же расчёт, что при уходе
    // аккаунта и удалении беседы.
    const survivors = keys.length
      ? await this.prisma.chatAttachment.findMany({
          where: { key: { in: keys }, messageId: { notIn: ids } },
          select: { key: true },
        })
      : [];

    await this.prisma.chatAttachment.deleteMany({
      where: { messageId: { in: ids } },
    });
    // Реакция — след человека на содержимом, которого больше нет.
    await this.prisma.chatMessageReaction.deleteMany({
      where: { messageId: { in: ids } },
    });
    await this.prisma.chatMessage.updateMany({
      where: { id: { in: ids } },
      data: { body: '' },
    });

    const orphans = orphanStorageKeys(
      keys,
      survivors.map((attachment) => attachment.key),
    );
    await this.uploads.removeMany(orphans);

    this.logger.log(
      `Вычищено удалённых сообщений: ${ids.length}, файлов: ${orphans.length}` +
        (keys.length > orphans.length
          ? `; ${keys.length - orphans.length} оставлены — их переслали другим`
          : ''),
    );
    // Полная пачка означает накопленный хвост: следующий тик возьмёт ещё.
    if (ids.length === BATCH)
      this.logger.log('Пачка заполнена — чистка продолжится следующим тиком');

    return ids.length;
  }
}
