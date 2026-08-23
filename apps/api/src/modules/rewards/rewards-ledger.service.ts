import { Injectable } from '@nestjs/common';
import type { RewardsBalance, RewardsLedgerType } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { balanceFromLedger } from './rewards-balance';
import { applyMonthlyCap, earnedInWindow, monthWindow } from './rewards-cap';

/** Что вышло из попытки начислить: строка леджера и след потолка. */
export interface AccrualResult {
  entryId: string | null;
  granted: number;
  withheld: number;
  capped: boolean;
}

/**
 * Запись и чтение операций. Всё, что меняет баланс, проходит здесь — иначе
 * месячный потолок пришлось бы вспоминать в каждом месте начисления.
 */
@Injectable()
export class RewardsLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async balance(userId: string): Promise<RewardsBalance> {
    const rows = await this.prisma.rewardsLedgerEntry.findMany({
      where: { userId },
      select: { id: true, type: true, amount: true, revokesId: true },
    });
    return balanceFromLedger(rows);
  }

  /** Сколько человеку начислено за текущий календарный месяц. */
  async earnedThisMonth(userId: string, now = new Date()): Promise<number> {
    const window = monthWindow(now);
    const rows = await this.prisma.rewardsLedgerEntry.findMany({
      where: {
        userId,
        amount: { gt: 0 },
        createdAt: { gte: window.from, lt: window.to },
      },
      select: { amount: true, createdAt: true },
    });
    return earnedInWindow(rows, window);
  }

  /**
   * Начислить с оглядкой на потолок. Ноль — законный исход: строка не
   * создаётся, а вызывающий пишет причину в журнал подозрений.
   */
  async accrue(params: {
    userId: string;
    type: Extract<RewardsLedgerType, 'welcome' | 'referral_l1' | 'referral_l2'>;
    amount: number;
    cap: number;
    referralId?: string | null;
    comment?: string | null;
    now?: Date;
  }): Promise<AccrualResult> {
    const now = params.now ?? new Date();
    const earned = await this.earnedThisMonth(params.userId, now);
    const capped = applyMonthlyCap(params.amount, earned, params.cap);
    if (capped.granted <= 0) {
      return {
        entryId: null,
        granted: 0,
        withheld: capped.withheld,
        capped: true,
      };
    }
    const entry = await this.prisma.rewardsLedgerEntry.create({
      data: {
        userId: params.userId,
        type: params.type,
        amount: capped.granted,
        referralId: params.referralId ?? null,
        comment: params.comment ?? null,
        createdAt: now,
      },
      select: { id: true },
    });
    return {
      entryId: entry.id,
      granted: capped.granted,
      withheld: capped.withheld,
      capped: capped.capped,
    };
  }
}
