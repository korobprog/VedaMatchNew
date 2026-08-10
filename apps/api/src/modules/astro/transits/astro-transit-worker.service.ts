import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NotificationEvent } from '@vedamatch/shared';
import Redis from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { AstroSettingsService } from '../astro-settings.service';
import { AstroTransitService } from './astro-transit.service';

const TICK_MS = 5 * 60_000;
const ACTIVITY_WINDOW_DAYS = 14;

/**
 * Ежедневная рассылка персонального дня. По архитектуре — как
 * MotivationWorkerService: опрос по таймеру вместо системного cron, чтобы не
 * тянуть отдельную библиотеку ради одного джоба, и необязательный Redis-лок,
 * который просто отсутствует в разработке.
 *
 * astro не импортирует NotificationsModule напрямую — это нарушило бы
 * изоляцию сервисов. Вместо этого он публикует самодостаточное событие через
 * EventEmitter2; NotificationsListener подписан на него и сам решает, слать
 * ли пуш, по предпочтениям пользователя.
 */
@Injectable()
export class AstroTransitWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AstroTransitWorkerService.name);
  private readonly redis: Redis | null;
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastRunDate?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly transits: AstroTransitService,
    private readonly settings: AstroSettingsService,
    private readonly events: EventEmitter2,
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
    if (this.redis) {
      await this.redis
        .connect()
        .catch((error) =>
          this.logger.warn(`Redis unavailable: ${String(error)}`),
        );
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
    void this.tick();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  async tick(now: Date = new Date()): Promise<void> {
    if (this.running) return;
    const dateKey = now.toISOString().slice(0, 10);
    if (this.lastRunDate === dateKey) return;

    this.running = true;
    const lockKey = `astro:transit-digest:${dateKey}`;
    if (this.redis?.status === 'ready') {
      const acquired = await this.redis
        .set(lockKey, '1', 'EX', 3600, 'NX')
        .catch(() => null);
      if (!acquired) {
        this.running = false;
        return;
      }
    }

    try {
      const settings = await this.settings.get();
      if (!settings.enabled) return;

      const userIds = await this.eligibleUserIds(now);
      this.logger.log(
        `Ежедневный персональный день: ${userIds.length} получателей`,
      );
      for (const userId of userIds) {
        await this.deliverTo(userId, now, settings.transitPushEnabled);
      }
      this.lastRunDate = dateKey;
    } catch (error) {
      this.logger.error(
        'Рассылка персонального дня упала',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  /**
   * Активность за последние 14 дней — тем, кто не открывал сервис, слать не
   * нужно: это экономия расхода на фразы и защита от отписок из-за спама.
   */
  private async eligibleUserIds(now: Date): Promise<string[]> {
    const cutoff = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 86_400_000);
    const rows = await this.prisma.astroBirthData.findMany({
      where: {
        timeAccuracy: { not: 'unknown' },
        OR: [
          { updatedAt: { gte: cutoff } },
          { user: { astroUsage: { some: { day: { gte: cutoff } } } } },
        ],
      },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  /**
   * Ошибка на одном человеке не должна остановить рассылку остальным — тот же
   * принцип, что в NotificationsListener.deliver.
   */
  private async deliverTo(
    userId: string,
    now: Date,
    pushEnabled: boolean,
  ): Promise<void> {
    try {
      const digest = await this.transits.today(userId, now);
      if (!digest || !digest.text) return;
      if (!pushEnabled) return;

      const event: NotificationEvent = {
        name: 'astro.transit.digest-ready',
        recipientId: userId,
        excerpt: digest.text,
      };
      this.events.emit(event.name, event);

      await this.prisma.astroTransitDigest.updateMany({
        where: { userId, forDate: dayKey(now), pushedAt: null },
        data: { pushedAt: now },
      });
    } catch (error) {
      this.logger.error(
        `Персональный день для ${userId} не удался`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

function dayKey(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
