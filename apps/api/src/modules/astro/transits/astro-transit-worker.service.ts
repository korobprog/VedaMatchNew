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
import { isLocalPushWindow, scanKey } from './transit-schedule';

const TICK_MS = 5 * 60_000;
const ACTIVITY_WINDOW_DAYS = 14;
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
 *
 * Время рассылки — 09:00 по местному времени человека (`User.timeZone`),
 * см. transit-schedule.ts. Раньше окно было одно на всех, московское, и на
 * Дальнем Востоке персональный день приходил к вечеру.
 */
@Injectable()
export class AstroTransitWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AstroTransitWorkerService.name);
  private readonly redis: Redis | null;
  private timer?: NodeJS.Timeout;
  private running = false;
  /**
   * Ключ последнего обхода — час по UTC. Утро у людей наступает в разных
   * зонах в разные часы, поэтому обход идёт каждый час, а не раз в сутки;
   * внутри часа ничей местный час не меняется, и чаще сканировать незачем.
   */
  private lastScanKey?: string;

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
    const key = scanKey(now);
    if (this.lastScanKey === key) return;

    this.running = true;
    // Аренда на один проход с освобождением в finally, а не замок до конца
    // часа: упавший посередине инстанс не должен оставить остальных без
    // рассылки, а от повторной отправки защищает pushedAt получателя.
    const lockKey = `astro:transit-digest:${key}`;
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

      // Кому сейчас утро. Час считается в поясе человека из портального
      // профиля; без пояса — по Москве, как было до появления поля.
      const recipients = (await this.eligibleRecipients(now)).filter(
        (recipient) => isLocalPushWindow(now, recipient.timeZone),
      );
      if (recipients.length > 0) {
        this.logger.log(
          `Персональный день: ${recipients.length} получателей, у кого сейчас утро`,
        );
      }
      for (const recipient of recipients) {
        await this.deliverTo(
          recipient.userId,
          now,
          settings.transitPushEnabled,
        );
      }
      this.lastScanKey = key;
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
  private async eligibleRecipients(
    now: Date,
  ): Promise<{ userId: string; timeZone: string | null }[]> {
    const cutoff = new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 86_400_000);
    const rows = await this.prisma.astroBirthData.findMany({
      where: {
        timeAccuracy: { not: 'unknown' },
        OR: [
          { updatedAt: { gte: cutoff } },
          { user: { astroUsage: { some: { day: { gte: cutoff } } } } },
        ],
      },
      // `User.timeZone` — портальное поле, читать его сервису можно.
      select: { userId: true, user: { select: { timeZone: true } } },
    });
    return rows.map((row) => ({
      userId: row.userId,
      timeZone: row.user?.timeZone ?? null,
    }));
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
      // Обход теперь ежечасный, и человек в двухчасовом окне попадается в
      // него дважды: не пересчитывать день и не ходить за фразой тому, кому
      // сегодня уже отправили.
      const existing = await this.prisma.astroTransitDigest.findUnique({
        where: { userId_forDate: { userId, forDate: dayKey(now) } },
        select: { pushedAt: true },
      });
      if (existing?.pushedAt) return;

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

/**
 * Ключ строки дайджеста — сутки по UTC, как и в AstroTransitService.today:
 * у человека на востоке «утро» приходится на конец предыдущих суток UTC, и
 * это нормально — каждому местному утру соответствуют свои сутки UTC, а
 * повтор отсекается по той же строке.
 */
function dayKey(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
