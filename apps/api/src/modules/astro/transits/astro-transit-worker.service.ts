import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { NotificationEvent } from '@vedamatch/shared';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { PrismaService } from '../../../prisma/prisma.service';
import { AstroSettingsService } from '../astro-settings.service';
import { AstroTransitService } from './astro-transit.service';

const TICK_MS = 5 * 60_000;
const ACTIVITY_WINDOW_DAYS = 14;
/** Москва круглый год UTC+3: перевода часов в России нет с 2014-го. */
const MSK_OFFSET_MS = 3 * 60 * 60_000;
/** Задуманное время рассылки — 09:00 МСК, когда день только начинается. */
const PUSH_HOUR_MSK = 9;
/**
 * Окно, а не одна минута: тик раз в пять минут, деплой или падение Redis не
 * должны отменять сегодняшнюю рассылку. Но и до бесконечности окно тянуть
 * нельзя — иначе рестарт вечером снова выглядит как рассылка не по расписанию.
 */
const PUSH_WINDOW_HOURS = 2;
/** Аренда на один проход, а не замок на сутки: см. tick(). */
const LEASE_MS = 10 * 60_000;

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
 *
 * Идемпотентность держится на строке AstroTransitDigest (pushedAt), а не на
 * памяти процесса: рестарт и деплой обнуляют любое поле экземпляра, и раньше
 * каждый подъём сервера рассылал сегодняшний пуш заново.
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
    // Тик на старте безопасен: вне окна рассылки он ничего не делает, а внутри
    // окна повторную отправку отсекает pushedAt конкретного получателя.
    void this.tick();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  async tick(now: Date = new Date()): Promise<void> {
    if (this.running) return;
    if (!isPushWindow(now)) return;
    const dateKey = now.toISOString().slice(0, 10);
    if (this.lastRunDate === dateKey) return;

    this.running = true;
    // Аренда на один проход с освобождением в finally, а не замок до конца
    // суток: упавший посередине инстанс не должен оставить остальных без
    // рассылки, а от повторной отправки защищает pushedAt получателя.
    const lockKey = `astro:transit-digest:${dateKey}`;
    const token = randomUUID();
    let leased = false;
    if (this.redis?.status === 'ready') {
      const acquired = await this.redis
        .set(lockKey, token, 'PX', LEASE_MS, 'NX')
        .catch(() => null);
      if (!acquired) {
        this.running = false;
        return;
      }
      leased = true;
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
      if (leased) await this.releaseLease(lockKey, token);
      this.running = false;
    }
  }

  /** Снимаем только свою аренду: чужую по истечении срока трогать нельзя. */
  private async releaseLease(lockKey: string, token: string): Promise<void> {
    if (this.redis?.status !== 'ready') return;
    await this.redis
      .eval(
        "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
        1,
        lockKey,
        token,
      )
      .catch(() => undefined);
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

      // Сначала занимаем сегодняшнюю строку, потом шлём: updateMany по
      // pushedAt: null атомарен, поэтому ни второй инстанс, ни рестарт,
      // ни лишний тик не отправят тот же пуш второй раз.
      const claimed = await this.prisma.astroTransitDigest.updateMany({
        where: { userId, forDate: dayKey(now), pushedAt: null },
        data: { pushedAt: now },
      });
      if (!claimed.count) return;

      const event: NotificationEvent = {
        name: 'astro.transit.digest-ready',
        recipientId: userId,
        excerpt: digest.text,
      };
      this.events.emit(event.name, event);
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

/**
 * Окно рассылки по московскому времени. Сервер живёт в UTC, поэтому местный
 * час считаем сдвигом, а не через локаль процесса: она зависит от образа и
 * молча уводит расписание при переезде контейнера.
 */
function isPushWindow(now: Date): boolean {
  const hour = new Date(now.getTime() + MSK_OFFSET_MS).getUTCHours();
  return hour >= PUSH_HOUR_MSK && hour < PUSH_HOUR_MSK + PUSH_WINDOW_HOURS;
}
