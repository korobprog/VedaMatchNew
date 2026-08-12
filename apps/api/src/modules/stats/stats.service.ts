import { Injectable } from '@nestjs/common';
import type { CommunityStats } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Публичная сводка по платформе. Кэшируем count(), чтобы гости на
 *  лендинге не грузили базу на каждый заход. */
@Injectable()
export class StatsService {
  private cache: { totalMembers: number; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async communityStats(): Promise<CommunityStats> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return { totalMembers: this.cache.totalMembers };
    }

    const totalMembers = await this.prisma.user.count();
    this.cache = { totalMembers, expiresAt: now + CACHE_TTL_MS };
    return { totalMembers };
  }
}
