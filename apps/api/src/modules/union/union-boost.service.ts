import { BadRequestException, Injectable } from '@nestjs/common';
import type { UnionBoostStatus } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { BOOST_DURATION_MS } from './union-limits';

/**
 * Буст «Внимание»: 40 минут анкета показывается раньше остальных. Пока проект
 * в бете буст бесплатный, ограничение одно — нельзя запустить второй поверх
 * активного.
 */
@Injectable()
export class UnionBoostService {
  constructor(private readonly prisma: PrismaService) {}

  async status(
    userId: string,
    now: Date = new Date(),
  ): Promise<UnionBoostStatus> {
    const active = await this.prisma.unionBoost.findFirst({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { expiresAt: 'desc' },
    });
    return this.toStatus(active?.expiresAt ?? null, now);
  }

  async activate(
    userId: string,
    now: Date = new Date(),
  ): Promise<UnionBoostStatus> {
    const current = await this.status(userId, now);
    if (current.active) {
      throw new BadRequestException('Внимание уже активно');
    }

    const boost = await this.prisma.unionBoost.create({
      data: {
        userId,
        startedAt: now,
        expiresAt: new Date(now.getTime() + BOOST_DURATION_MS),
      },
    });
    return this.toStatus(boost.expiresAt, now);
  }

  /** Чьи анкеты сейчас идут первыми в выдаче. */
  async boostedUserIds(now: Date = new Date()): Promise<Set<string>> {
    const rows = await this.prisma.unionBoost.findMany({
      where: { expiresAt: { gt: now } },
      select: { userId: true },
    });
    return new Set(rows.map((row) => row.userId));
  }

  private toStatus(expiresAt: Date | null, now: Date): UnionBoostStatus {
    const durationMinutes = Math.round(BOOST_DURATION_MS / 60_000);
    if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
      return {
        active: false,
        expiresAt: null,
        secondsLeft: 0,
        durationMinutes,
      };
    }
    return {
      active: true,
      expiresAt: expiresAt.toISOString(),
      secondsLeft: Math.ceil((expiresAt.getTime() - now.getTime()) / 1000),
      durationMinutes,
    };
  }
}
