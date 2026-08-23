import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import {
  REWARDS_REVOKE_REASON_MAX,
  resolveDisplayName,
  type AdminAuditEvent,
  type AdminRewardsFraudResponse,
  type AdminRewardsLedgerQuery,
  type AdminRewardsLedgerResponse,
  type AdminRewardsSettingsDto,
  type AdminRewardsSummaryDto,
  type AdminUpdateRewardsSettingsRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { readBillingMode } from '../billing/billing-mode';
import {
  REWARDS_SETTINGS_ID,
  RewardsSettingsService,
} from './rewards-settings.service';
import { revokedIds } from './rewards-balance';
import { toLedgerDto } from './rewards.service';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const TOP_INVITERS = 10;

/** Настройки, которые правятся из админки, и их разумные границы. */
const SETTING_LIMITS: Record<
  keyof Omit<AdminRewardsSettingsDto, 'updatedAt'>,
  { min: number; max: number }
> = {
  levelOnePoints: { min: 0, max: 10_000 },
  levelTwoPoints: { min: 0, max: 10_000 },
  welcomePoints: { min: 0, max: 10_000 },
  monthlyCapPoints: { min: 0, max: 1_000_000 },
  accrualDelayHours: { min: 0, max: 24 * 30 },
  qualifyMinDays: { min: 0, max: 365 },
};

@Injectable()
export class RewardsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: RewardsSettingsService,
    private readonly events: EventEmitter2,
  ) {}

  async ledger(
    query: AdminRewardsLedgerQuery,
  ): Promise<AdminRewardsLedgerResponse> {
    const page = Math.max(1, Math.trunc(query.page ?? 1) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(
        1,
        Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE,
      ),
    );
    const where: Prisma.RewardsLedgerEntryWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.since ? { createdAt: { gte: new Date(query.since) } } : {}),
    };

    const [rows, total, revocations] = await Promise.all([
      this.prisma.rewardsLedgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { name: true, email: true } } },
      }),
      this.prisma.rewardsLedgerEntry.count({ where }),
      this.prisma.rewardsLedgerEntry.findMany({
        where: { type: 'admin_revoke' },
        select: { id: true, type: true, amount: true, revokesId: true },
      }),
    ]);
    const revoked = revokedIds(revocations);

    return {
      items: rows.map((row) => ({
        ...toLedgerDto(row, revoked),
        userId: row.userId,
        // Мирское имя: админка, а не выдача наружу.
        userName: row.user.name,
        userEmail: row.user.email,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * Отмена начисления. Не удаление: исходная строка остаётся, рядом
   * появляется вторая со знаком минус. История начислений — это то, на что
   * человек смотрит в споре, и переписывать её нельзя.
   */
  async revoke(adminId: string, entryId: string, rawReason: string) {
    const reason = (rawReason ?? '').trim();
    if (!reason) throw new BadRequestException('Причина отмены обязательна');
    if (reason.length > REWARDS_REVOKE_REASON_MAX) {
      throw new BadRequestException('Причина слишком длинная');
    }

    const entry = await this.prisma.rewardsLedgerEntry.findUnique({
      where: { id: entryId },
      select: {
        id: true,
        userId: true,
        type: true,
        amount: true,
        referralId: true,
        revokedBy: { select: { id: true } },
      },
    });
    if (!entry) throw new NotFoundException('Операция не найдена');
    if (entry.amount <= 0) {
      throw new BadRequestException('Отменять можно только начисление');
    }
    if (entry.revokedBy) {
      throw new BadRequestException('Начисление уже отменено');
    }

    const created = await this.prisma.rewardsLedgerEntry.create({
      data: {
        userId: entry.userId,
        type: 'admin_revoke',
        amount: -entry.amount,
        referralId: entry.referralId,
        revokesId: entry.id,
        actorId: adminId,
        comment: reason,
      },
    });

    const event: AdminAuditEvent = {
      actorId: adminId,
      action: 'rewards.entry-revoked',
      targetType: 'user',
      targetId: entry.userId,
      details: { amount: entry.amount, reason, target: entry.id },
    };
    this.events.emit('admin.action', event);
    return created;
  }

  async fraud(
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  ): Promise<AdminRewardsFraudResponse> {
    const current = Math.max(1, Math.trunc(page) || 1);
    const size = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.trunc(pageSize) || DEFAULT_PAGE_SIZE),
    );
    const [rows, total] = await Promise.all([
      this.prisma.rewardsFraudLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (current - 1) * size,
        take: size,
        include: {
          inviter: { select: { name: true } },
          invitee: { select: { name: true } },
        },
      }),
      this.prisma.rewardsFraudLog.count(),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        reason: row.reason,
        inviterId: row.inviterId,
        inviterName: row.inviter?.name ?? null,
        inviteeId: row.inviteeId,
        inviteeName: row.invitee?.name ?? null,
        details: row.details,
        createdAt: row.createdAt.toISOString(),
      })),
      page: current,
      pageSize: size,
      total,
      totalPages: Math.max(1, Math.ceil(total / size)),
    };
  }

  settingsDto(): Promise<AdminRewardsSettingsDto> {
    return this.settings.dto();
  }

  async updateSettings(
    adminId: string,
    body: AdminUpdateRewardsSettingsRequest,
  ): Promise<AdminRewardsSettingsDto> {
    const before = await this.settings.read();
    const data: Record<string, number> = {};
    const changed: string[] = [];

    for (const key of Object.keys(SETTING_LIMITS) as Array<
      keyof typeof SETTING_LIMITS
    >) {
      const value = body[key];
      if (value === undefined) continue;
      if (!Number.isFinite(value)) {
        throw new BadRequestException(`Значение ${key} должно быть числом`);
      }
      const rounded = Math.trunc(value);
      const { min, max } = SETTING_LIMITS[key];
      if (rounded < min || rounded > max) {
        throw new BadRequestException(
          `Значение ${key} вне диапазона ${min}…${max}`,
        );
      }
      if (rounded === before[key]) continue;
      data[key] = rounded;
      changed.push(`${key}: ${before[key]} → ${rounded}`);
    }

    if (changed.length === 0) return this.settings.dto();

    await this.prisma.rewardsSettings.update({
      where: { id: REWARDS_SETTINGS_ID },
      data,
    });

    const event: AdminAuditEvent = {
      actorId: adminId,
      action: 'rewards.settings-changed',
      targetType: 'platform',
      targetId: null,
      details: { to: changed.join('; ') },
    };
    this.events.emit('admin.action', event);
    return this.settings.dto();
  }

  /** Сводка раздела: приглашений, конверсия, баллы, топ приглашающих. */
  async summary(): Promise<AdminRewardsSummaryDto> {
    const [
      invitedTotal,
      qualifiedTotal,
      awarded,
      revoked,
      fraudSuspicions,
      mode,
    ] = await Promise.all([
      this.prisma.rewardsReferral.count(),
      this.prisma.rewardsReferral.count({
        where: { status: { in: ['qualified', 'awarded'] } },
      }),
      this.prisma.rewardsLedgerEntry.aggregate({
        _sum: { amount: true },
        where: { amount: { gt: 0 } },
      }),
      this.prisma.rewardsLedgerEntry.aggregate({
        _sum: { amount: true },
        where: { type: 'admin_revoke' },
      }),
      this.prisma.rewardsFraudLog.count(),
      readBillingMode(this.prisma),
    ]);

    const grouped = await this.prisma.rewardsReferral.groupBy({
      by: ['inviterId'],
      _count: { _all: true },
      orderBy: { _count: { inviterId: 'desc' } },
      take: TOP_INVITERS,
    });
    const inviterIds = grouped.map((row) => row.inviterId);

    // Три запроса по отдельности, а не одним Promise.all: у groupBy условный
    // тип результата, и в кортеже он утягивает соседей к `any` — вместе с
    // ними теряется всякая проверка полей ниже.
    const inviters = inviterIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: inviterIds } },
          select: { id: true, name: true, spiritualName: true },
        })
      : [];
    const qualifiedByInviter = inviterIds.length
      ? await this.prisma.rewardsReferral.groupBy({
          by: ['inviterId'],
          where: {
            inviterId: { in: inviterIds },
            status: { in: ['qualified', 'awarded'] },
          },
          _count: { _all: true },
        })
      : [];
    const pointsByInviter = inviterIds.length
      ? await this.prisma.rewardsLedgerEntry.groupBy({
          by: ['userId'],
          where: {
            userId: { in: inviterIds },
            type: { in: ['referral_l1', 'referral_l2'] },
          },
          _sum: { amount: true },
        })
      : [];

    const nameById = new Map<string, string>(
      inviters.map((user) => [user.id, resolveDisplayName(user)] as const),
    );
    const qualifiedById = new Map<string, number>(
      qualifiedByInviter.map(
        (row) => [row.inviterId, row._count._all] as const,
      ),
    );
    const pointsById = new Map<string, number>(
      pointsByInviter.map((row) => [row.userId, row._sum.amount ?? 0] as const),
    );

    return {
      invitedTotal,
      qualifiedTotal,
      conversion: invitedTotal > 0 ? qualifiedTotal / invitedTotal : 0,
      pointsAwarded: awarded._sum.amount ?? 0,
      pointsRevoked: Math.abs(revoked._sum.amount ?? 0),
      fraudSuspicions,
      topInviters: grouped.map((row) => ({
        userId: row.inviterId,
        name: nameById.get(row.inviterId) ?? '—',
        invited: row._count._all,
        qualified: qualifiedById.get(row.inviterId) ?? 0,
        points: pointsById.get(row.inviterId) ?? 0,
      })),
      mode,
    };
  }
}
