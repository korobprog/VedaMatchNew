import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RewardsReferralsService } from './rewards-referrals.service';

/** Лиз в Redis: тик выполняется одним экземпляром, сколько бы их ни было. */
const LOCK_KEY = 'rewards:worker:lease';
const LOCK_TTL_MS = 120_000;
const TICK_MS = 30_000;
/** Через сколько клейм считается брошенным и заявка возвращается в очередь. */
const CLAIM_EXPIRY_MS = 5 * 60_000;
const MAX_ATTEMPTS = 3;

/**
 * Отложенное начисление. Устройство скопировано с MotivationWorkerService —
 * тик раз в 30 секунд под Redis-лизом, клейм через `updateMany` с проверкой
 * статуса, ретраи и восстановление зависших по `claimedAt`.
 *
 * Задержка здесь не техническая: мгновенное начисление накручивается ботом,
 * который регистрируется, шлёт сообщение и уходит. Заявка ждёт своего часа
 * в самой таблице (`eligibleAt`), отдельной очереди для этого не нужно.
 */
@Injectable()
export class RewardsWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RewardsWorkerService.name);
  private readonly redis: Redis | null;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly referrals: RewardsReferralsService,
    private readonly config: ConfigService,
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
          this.logger.warn(`Redis недоступен: ${String(error)}`),
        );
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    const token = randomUUID();
    if (this.redis?.status === 'ready') {
      const acquired = await this.redis
        .set(LOCK_KEY, token, 'PX', LOCK_TTL_MS, 'NX')
        .catch(() => null);
      if (!acquired) {
        this.running = false;
        return;
      }
    }
    try {
      await this.recoverExpiredClaims(now);
      const referral = await this.prisma.rewardsReferral.findFirst({
        where: {
          status: { in: ['registered', 'qualified'] },
          activityAt: { not: null },
          eligibleAt: { not: null, lte: now },
          claimedAt: null,
          attemptCount: { lt: MAX_ATTEMPTS },
        },
        orderBy: { eligibleAt: 'asc' },
        select: { id: true, status: true },
      });
      if (!referral) return;

      // Клейм как CAS: параллельный экземпляр без Redis не должен разобрать
      // ту же заявку и начислить дважды.
      const claimed = await this.prisma.rewardsReferral.updateMany({
        where: { id: referral.id, status: referral.status, claimedAt: null },
        data: { claimedAt: now, attemptCount: { increment: 1 } },
      });
      if (!claimed.count) return;

      try {
        const outcome = await this.referrals.process(referral.id, now);
        this.logger.log(`Реферал ${referral.id}: ${outcome}`);
      } catch (error) {
        await this.prisma.rewardsReferral.update({
          where: { id: referral.id },
          data: {
            claimedAt: null,
            lastError: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    } catch (error) {
      this.logger.error(
        'Тик начислений упал',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      if (this.redis?.status === 'ready')
        await this.redis
          .eval(
            "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
            1,
            LOCK_KEY,
            token,
          )
          .catch(() => undefined);
      this.running = false;
    }
  }

  /** Заявки, чей обработчик умер на середине, возвращаются в очередь. */
  private async recoverExpiredClaims(now: Date): Promise<void> {
    await this.prisma.rewardsReferral.updateMany({
      where: {
        claimedAt: { lt: new Date(now.getTime() - CLAIM_EXPIRY_MS) },
        status: { in: ['registered', 'qualified'] },
      },
      data: { claimedAt: null, lastError: 'клейм истёк' },
    });
  }
}
