import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { NotificationAudienceFilter } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BROADCAST_BATCH_SIZE,
  buildAudienceWhere,
  normalizeAudience,
} from './broadcast-audience';
import { NotificationsService } from './notifications.service';
import { PushSenderService } from './push-sender.service';

const TICK_MS = 30_000;
const LEASE_MS = 300_000;
/** Сколько тик работает, прежде чем отпустить лиз. Остаток догоняется со
 *  следующего тика — курсор рассылки для того и хранится. */
const TICK_BUDGET_MS = 60_000;
/** Одновременных пушей. Последовательно — слишком долго, без предела — риск
 *  упереться в лимиты пуш-сервиса. */
const PUSH_CONCURRENCY = 10;
const MAX_ATTEMPTS = 3;

/**
 * Фоновая отправка рассылок. Устроен как MotivationWorkerService: тик раз в
 * 30 секунд под Redis-лизом, статус проверяется на каждом пакете, ретраи по
 * `attemptCount`. Отличие одно: единица работы — не задача, а курсор по
 * пользователям, поэтому оборвавшийся тик просто продолжается со следующего.
 */
@Injectable()
export class NotificationBroadcastWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationBroadcastWorkerService.name);
  private readonly redis: Redis | null;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly sender: PushSenderService,
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
    const lockKey = 'notifications:broadcast:lease';
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
      await this.drain();
    } catch (error) {
      this.logger.error(
        'Тик рассылок упал',
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

  /** Разбирает рассылки в работе, пока есть время в бюджете тика. */
  private async drain(): Promise<void> {
    const until = Date.now() + TICK_BUDGET_MS;
    while (Date.now() < until) {
      const broadcast = await this.prisma.notificationBroadcast.findFirst({
        where: { status: 'sending', attemptCount: { lt: MAX_ATTEMPTS } },
        orderBy: { startedAt: 'asc' },
      });
      if (!broadcast) return;

      try {
        const done = await this.sendBatch(broadcast.id);
        if (done) continue;
      } catch (error) {
        await this.failAttempt(broadcast.id, error);
        return;
      }
    }
  }

  /**
   * Один пакет получателей. Возвращает `true`, когда рассылка дошла до конца
   * или была отменена — тогда следующий заход возьмётся за другую.
   */
  private async sendBatch(broadcastId: string): Promise<boolean> {
    const broadcast = await this.prisma.notificationBroadcast.findUnique({
      where: { id: broadcastId },
    });
    // Статус перечитывается на каждом пакете: «Отменить» нажимают как раз
    // посреди отправки, и следующий пакет уйти уже не должен.
    if (!broadcast || broadcast.status !== 'sending') return true;

    const audience = normalizeAudience(
      broadcast.audience as NotificationAudienceFilter,
    );
    const where = buildAudienceWhere(audience, new Date());
    const recipients = await this.prisma.user.findMany({
      where: broadcast.cursorUserId
        ? { AND: [where, { id: { gt: broadcast.cursorUserId } }] }
        : where,
      orderBy: { id: 'asc' },
      take: BROADCAST_BATCH_SIZE,
      select: {
        id: true,
        notificationPreference: { select: { enabled: true, announcements: true } },
      },
    });

    if (recipients.length === 0) {
      await this.prisma.notificationBroadcast.update({
        where: { id: broadcastId },
        data: { status: 'sent', finishedAt: new Date() },
      });
      this.logger.log(
        `Рассылка ${broadcastId} завершена: ${broadcast.deliveredCount} из ${broadcast.totalRecipients}`,
      );
      return true;
    }

    // Настроек может не быть вовсе — это значит «по умолчанию всё включено».
    const allowed = recipients.filter(
      (user) =>
        (user.notificationPreference?.enabled ?? true) &&
        (user.notificationPreference?.announcements ?? true),
    );
    const inboxTargets = broadcast.important ? recipients : allowed;

    await this.notifications.addManyToInbox(
      inboxTargets.map((user) => user.id),
      {
        title: broadcast.title,
        body: broadcast.body,
        url: broadcast.url ?? '/notifications',
        category: 'announcements',
      },
    );

    const pushSent = await this.pushToAll(
      allowed.map((user) => user.id),
      {
        title: broadcast.title,
        body: broadcast.body,
        url: broadcast.url ?? '/notifications',
        tag: `broadcast-${broadcastId}`,
      },
    );

    await this.prisma.notificationBroadcast.update({
      where: { id: broadcastId },
      data: {
        cursorUserId: recipients[recipients.length - 1].id,
        deliveredCount: { increment: inboxTargets.length },
        pushSentCount: { increment: pushSent },
      },
    });
    return false;
  }

  /** Возвращает число доставленных пушей; недоставленные не роняют пакет. */
  private async pushToAll(
    userIds: string[],
    payload: { title: string; body: string; url: string; tag: string },
  ): Promise<number> {
    if (userIds.length === 0) return 0;
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });

    let delivered = 0;
    for (let i = 0; i < subscriptions.length; i += PUSH_CONCURRENCY) {
      const chunk = subscriptions.slice(i, i + PUSH_CONCURRENCY);
      const results = await Promise.all(
        chunk.map(async (subscription) => {
          const failure = await this.sender.send(subscription, payload);
          if (failure === 'gone') {
            await this.notifications.deleteSubscription(subscription.endpoint);
          }
          return failure === null;
        }),
      );
      delivered += results.filter(Boolean).length;
    }
    return delivered;
  }

  /**
   * Неудачный пакет. Курсор при этом не двигался, поэтому попытка повторится
   * с того же места; после трёх — рассылка помечается ошибкой и стоит.
   */
  private async failAttempt(id: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const current = await this.prisma.notificationBroadcast.update({
      where: { id },
      data: { attemptCount: { increment: 1 }, errorMessage: message },
    });
    if (current.attemptCount >= MAX_ATTEMPTS) {
      await this.prisma.notificationBroadcast.update({
        where: { id },
        data: { status: 'failed', finishedAt: new Date() },
      });
    }
    this.logger.error(
      `Пакет рассылки ${id} не отправлен (попытка ${current.attemptCount}): ${message}`,
    );
  }
}
