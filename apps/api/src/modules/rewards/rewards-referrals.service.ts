import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  PortalActivityAction,
  RewardsFraudReason,
  UserRegisteredEvent,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RewardsAccountsService } from './rewards-accounts.service';
import { RewardsLedgerService } from './rewards-ledger.service';
import { RewardsSettingsService } from './rewards-settings.service';
import { normalizeReferralCode } from './rewards-code';
import { referralPayouts } from './rewards-levels';
import { qualifyReferral } from './rewards-qualify';
import {
  describeFraudEvidence,
  detectSelfInvite,
  type SignupSignals,
} from './rewards-fraud';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Город из портального `User.homeLocation`. Json читается read-only. */
export function cityOfHomeLocation(
  value: Prisma.JsonValue | null,
): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const city = (value as Record<string, unknown>).city;
  return typeof city === 'string' && city.trim() ? city : null;
}

/**
 * Реферальные связи: привязка при регистрации, отметка активности и само
 * начисление. Сервисы-источники сюда не заглядывают — всё приходит событиями.
 */
@Injectable()
export class RewardsReferralsService {
  private readonly logger = new Logger(RewardsReferralsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: RewardsAccountsService,
    private readonly ledger: RewardsLedgerService,
    private readonly settings: RewardsSettingsService,
  ) {}

  /**
   * Регистрация нового аккаунта. Заводит счёт, привязывает пригласившего и
   * выдаёт приветственные баллы.
   *
   * В бете это единственное мгновенное начисление, и сумма у него маленькая
   * намеренно: мгновенное начисление накручивается легче всего, а всё
   * весомое ждёт подтверждённой активности.
   */
  async onRegistered(event: UserRegisteredEvent): Promise<void> {
    const registeredAt = new Date(event.occurredAt);
    await this.accounts.ensure(event.userId, {
      ip: event.ip,
      deviceId: event.deviceId,
    });

    const code = normalizeReferralCode(event.referralCode);
    if (!code) return;

    const inviterId = await this.accounts.findOwnerByCode(code);
    if (!inviterId) {
      this.logger.warn(`Неизвестный реферальный код ${code} при регистрации`);
      return;
    }

    // Приглашённым можно стать один раз: повторный вызов события (ретрай
    // шины, вторая вкладка) не должен заводить вторую связь.
    const already = await this.prisma.rewardsReferral.findUnique({
      where: { inviteeId: event.userId },
      select: { id: true },
    });
    if (already) return;

    const inviterSignals = await this.signalsOf(inviterId);
    const inviteeSignals: SignupSignals = {
      userId: event.userId,
      email: event.email,
      ip: event.ip,
      deviceId: event.deviceId,
      registeredAt,
    };
    const suspicion = inviterSignals
      ? detectSelfInvite(inviterSignals, inviteeSignals)
      : inviterId === event.userId
        ? ('self_invite' as RewardsFraudReason)
        : null;

    const settings = await this.settings.read();
    const referral = await this.prisma.rewardsReferral.create({
      data: {
        inviterId,
        inviteeId: event.userId,
        code,
        source: event.referralSource,
        status: suspicion ? 'rejected' : 'registered',
        rejectedReason: suspicion ?? null,
        createdAt: registeredAt,
        // Раньше «взросления» приглашённого воркеру тут делать нечего.
        eligibleAt: suspicion
          ? null
          : new Date(
              registeredAt.getTime() +
                Math.max(0, settings.qualifyMinDays) * DAY_MS,
            ),
      },
      select: { id: true },
    });

    if (suspicion) {
      await this.logSuspicion(
        suspicion,
        inviterId,
        event.userId,
        inviterSignals
          ? describeFraudEvidence(suspicion, inviterSignals, inviteeSignals)
          : 'переход по собственной ссылке',
      );
      return;
    }

    if (settings.welcomePoints > 0) {
      const result = await this.ledger.accrue({
        userId: event.userId,
        type: 'welcome',
        amount: settings.welcomePoints,
        cap: settings.monthlyCapPoints,
        referralId: referral.id,
        comment: 'Приветственные баллы за переход по приглашению',
        now: registeredAt,
      });
      if (result.capped) {
        await this.logSuspicion(
          'monthly_cap',
          inviterId,
          event.userId,
          `срезано ${result.withheld} приветственных баллов`,
        );
      }
    }
  }

  /**
   * Осмысленное действие приглашённого. Фиксируется только первое: программа
   * платит за то, что человек ожил, а не за счётчик сообщений.
   */
  async onActivity(
    userId: string,
    action: PortalActivityAction,
    occurredAt: Date,
  ): Promise<void> {
    await this.prisma.rewardsReferral.updateMany({
      where: { inviteeId: userId, status: 'registered', activityAt: null },
      data: { activityAt: occurredAt, activityKind: action },
    });
  }

  /**
   * Разбор одной заявки очереди: проверить условие и, если срок подошёл,
   * начислить. Возвращает короткое описание исхода — воркер пишет его в лог.
   */
  async process(referralId: string, now = new Date()): Promise<string> {
    const referral = await this.prisma.rewardsReferral.findUnique({
      where: { id: referralId },
      select: {
        id: true,
        inviterId: true,
        inviteeId: true,
        status: true,
        activityAt: true,
        createdAt: true,
        qualifiedAt: true,
        invitee: {
          select: { name: true, avatarUrl: true, homeLocation: true },
        },
      },
    });
    if (!referral) return 'заявка исчезла';

    const settings = await this.settings.read();

    // Уже признанные квалифицированными не переоценивают условие: они ждут
    // только освободившегося месячного потолка.
    if (referral.status === 'registered') {
      const verdict = qualifyReferral(
        {
          registeredAt: referral.createdAt,
          profile: {
            name: referral.invitee.name,
            avatarUrl: referral.invitee.avatarUrl,
            city: cityOfHomeLocation(referral.invitee.homeLocation),
          },
          activityAt: referral.activityAt,
        },
        {
          qualifyMinDays: settings.qualifyMinDays,
          accrualDelayHours: settings.accrualDelayHours,
        },
        now,
      );

      if (!verdict.qualified) {
        await this.prisma.rewardsReferral.update({
          where: { id: referral.id },
          data: {
            claimedAt: null,
            attemptCount: 0,
            lastError: null,
            // Профиль дозаполняют когда угодно — заглядываем через сутки.
            eligibleAt:
              verdict.reason === 'too_early'
                ? verdict.eligibleAt
                : new Date(now.getTime() + DAY_MS),
          },
        });
        return `условие не выполнено: ${verdict.reason}`;
      }

      if (verdict.eligibleAt.getTime() > now.getTime()) {
        // Отложенное начисление: условие выполнено, но выдержка ещё идёт.
        await this.prisma.rewardsReferral.update({
          where: { id: referral.id },
          data: {
            status: 'qualified',
            qualifiedAt: verdict.qualifiedAt,
            eligibleAt: verdict.eligibleAt,
            claimedAt: null,
            attemptCount: 0,
          },
        });
        return 'условие выполнено, ждём выдержку';
      }

      await this.prisma.rewardsReferral.update({
        where: { id: referral.id },
        data: { status: 'qualified', qualifiedAt: verdict.qualifiedAt },
      });
    }

    return this.award(referral.id, referral.inviterId, referral.inviteeId, now);
  }

  /** Начисление обоим уровням. Уровень вычисляется по цепочке, а не хранится. */
  private async award(
    referralId: string,
    inviterId: string,
    inviteeId: string,
    now: Date,
  ): Promise<string> {
    const settings = await this.settings.read();
    const parent = await this.prisma.rewardsReferral.findUnique({
      where: { inviteeId: inviterId },
      select: { inviterId: true, status: true },
    });
    const payouts = referralPayouts(
      {
        inviteeId,
        inviterId,
        // Отклонённая связь пригласившего не даёт уровня 2: иначе
        // самоприглашение окупалось бы через внука.
        grandInviterId:
          parent && parent.status !== 'rejected' ? parent.inviterId : null,
      },
      {
        levelOnePoints: settings.levelOnePoints,
        levelTwoPoints: settings.levelTwoPoints,
      },
    );

    if (payouts.length === 0) {
      await this.prisma.rewardsReferral.update({
        where: { id: referralId },
        data: {
          status: 'rejected',
          rejectedReason: 'номиналы обнулены в настройках',
          claimedAt: null,
          eligibleAt: null,
        },
      });
      return 'начислять нечего: номиналы обнулены';
    }

    let granted = 0;
    let capped = false;
    for (const payout of payouts) {
      const result = await this.ledger.accrue({
        userId: payout.userId,
        type: payout.level === 1 ? 'referral_l1' : 'referral_l2',
        amount: payout.points,
        cap: settings.monthlyCapPoints,
        referralId,
        comment:
          payout.level === 1
            ? 'За приглашённого участника'
            : 'За приглашённого вторым уровнем',
        now,
      });
      granted += result.granted;
      if (result.capped) {
        capped = true;
        await this.logSuspicion(
          'monthly_cap',
          payout.userId,
          inviteeId,
          `срезано ${result.withheld} баллов уровня ${payout.level}`,
        );
      }
    }

    if (granted > 0) {
      await this.prisma.rewardsReferral.update({
        where: { id: referralId },
        data: {
          status: 'awarded',
          awardedAt: now,
          claimedAt: null,
          eligibleAt: null,
          attemptCount: 0,
          lastError: null,
        },
      });
      return capped
        ? `начислено ${granted} с учётом потолка`
        : `начислено ${granted}`;
    }

    // Потолок выбран целиком: возвращаемся в начале следующего месяца, а не
    // через сутки — раньше него запас всё равно не появится.
    await this.prisma.rewardsReferral.update({
      where: { id: referralId },
      data: {
        claimedAt: null,
        attemptCount: 0,
        eligibleAt: new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
        ),
      },
    });
    return 'потолок выбран, ждём следующий месяц';
  }

  /** Сигналы регистрации человека для антифрода. */
  private async signalsOf(userId: string): Promise<SignupSignals | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        createdAt: true,
        rewardsAccount: { select: { signupIp: true, signupDeviceId: true } },
      },
    });
    if (!user) return null;
    return {
      userId: user.id,
      email: user.email,
      ip: user.rewardsAccount?.signupIp ?? null,
      deviceId: user.rewardsAccount?.signupDeviceId ?? null,
      registeredAt: user.createdAt,
    };
  }

  private async logSuspicion(
    reason: RewardsFraudReason,
    inviterId: string | null,
    inviteeId: string | null,
    details: string,
  ): Promise<void> {
    await this.prisma.rewardsFraudLog.create({
      data: { reason, inviterId, inviteeId, details },
    });
  }
}
