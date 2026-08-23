import { Injectable } from '@nestjs/common';
import {
  resolveDisplayName,
  type RewardsLedgerEntryDto,
  type RewardsLedgerResponse,
  type RewardsMeDto,
  type RewardsReferralDto,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { readBillingMode } from '../billing/billing-mode';
import { RewardsAccountsService } from './rewards-accounts.service';
import { RewardsLedgerService } from './rewards-ledger.service';
import { RewardsSettingsService } from './rewards-settings.service';
import { revokedIds } from './rewards-balance';

const PAGE_SIZE = 20;

/** Экран баллов: баланс, ссылка, приглашённые, история. */
@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: RewardsAccountsService,
    private readonly ledger: RewardsLedgerService,
    private readonly settings: RewardsSettingsService,
  ) {}

  async me(userId: string): Promise<RewardsMeDto> {
    const [account, mode, balance, earnedThisMonth, settings] =
      await Promise.all([
        this.accounts.ensure(userId),
        readBillingMode(this.prisma),
        this.ledger.balance(userId),
        this.ledger.earnedThisMonth(userId),
        this.settings.read(),
      ]);

    const { direct, second } = await this.chain(userId);
    const all = [...direct, ...second];

    return {
      ...balance,
      code: account.code,
      link: this.accounts.referralLink(account.code),
      mode,
      // В бете тратить некуда: платёжного контура нет, и эндпоинта списания
      // тоже. Флаг говорит вебу, показывать ли пояснение про накопление.
      spendEnabled: mode === 'business',
      earnedThisMonth,
      monthlyCap: settings.monthlyCapPoints,
      welcomePoints: settings.welcomePoints,
      invitedTotal: all.length,
      qualifiedTotal: all.filter(
        (r) => r.status === 'qualified' || r.status === 'awarded',
      ).length,
    };
  }

  async referrals(userId: string): Promise<RewardsReferralDto[]> {
    const { direct, second } = await this.chain(userId);
    const referralIds = [...direct, ...second].map((r) => r.id);

    // Сколько начислено смотрящему за каждого: строки чужих людей по той же
    // связи (уровень 1 у пригласившего) в его экран попадать не должны.
    const entries = referralIds.length
      ? await this.prisma.rewardsLedgerEntry.findMany({
          where: { userId, referralId: { in: referralIds }, amount: { gt: 0 } },
          select: { referralId: true, amount: true },
        })
      : [];
    const pointsByReferral = new Map<string, number>();
    for (const entry of entries) {
      if (!entry.referralId) continue;
      pointsByReferral.set(
        entry.referralId,
        (pointsByReferral.get(entry.referralId) ?? 0) + entry.amount,
      );
    }

    const toDto = (
      row: (typeof direct)[number],
      level: 1 | 2,
    ): RewardsReferralDto => ({
      id: row.id,
      name: resolveDisplayName(row.invitee),
      avatarUrl: row.invitee.avatarUrl,
      status: row.status,
      level,
      createdAt: row.createdAt.toISOString(),
      qualifiedAt: row.qualifiedAt?.toISOString() ?? null,
      awardedAt: row.awardedAt?.toISOString() ?? null,
      points: pointsByReferral.get(row.id) ?? null,
    });

    return [
      ...direct.map((row) => toDto(row, 1)),
      ...second.map((row) => toDto(row, 2)),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async ledgerPage(userId: string, page = 1): Promise<RewardsLedgerResponse> {
    const current = Math.max(1, Math.trunc(page) || 1);
    const [rows, total, revocations] = await Promise.all([
      this.prisma.rewardsLedgerEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (current - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      this.prisma.rewardsLedgerEntry.count({ where: { userId } }),
      this.prisma.rewardsLedgerEntry.findMany({
        where: { userId, type: 'admin_revoke' },
        select: { id: true, type: true, amount: true, revokesId: true },
      }),
    ]);
    const revoked = revokedIds(revocations);

    return {
      items: rows.map((row) => toLedgerDto(row, revoked)),
      page: current,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }

  /**
   * Оба уровня одним походом в базу: сначала свои приглашённые, потом их
   * приглашённые. Третий уровень не читается — начислений там нет.
   */
  private async chain(userId: string) {
    const select = {
      id: true,
      status: true,
      createdAt: true,
      qualifiedAt: true,
      awardedAt: true,
      inviteeId: true,
      invitee: {
        select: { name: true, spiritualName: true, avatarUrl: true },
      },
    } as const;

    const direct = await this.prisma.rewardsReferral.findMany({
      where: { inviterId: userId },
      orderBy: { createdAt: 'desc' },
      select,
    });
    const second = direct.length
      ? await this.prisma.rewardsReferral.findMany({
          where: { inviterId: { in: direct.map((row) => row.inviteeId) } },
          orderBy: { createdAt: 'desc' },
          select,
        })
      : [];
    return { direct, second };
  }
}

export function toLedgerDto(
  row: {
    id: string;
    type: string;
    amount: number;
    comment: string | null;
    referralId: string | null;
    createdAt: Date;
  },
  revoked: ReadonlySet<string>,
): RewardsLedgerEntryDto {
  return {
    id: row.id,
    type: row.type as RewardsLedgerEntryDto['type'],
    amount: row.amount,
    comment: row.comment,
    referralId: row.referralId,
    createdAt: row.createdAt.toISOString(),
    revoked: revoked.has(row.id),
  };
}
