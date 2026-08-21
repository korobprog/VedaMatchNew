import { Injectable } from '@nestjs/common';
import type { CommunityStats, PortalStats } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { APP_SETTINGS_ID } from '../billing/billing-mode';
import {
  fillDailySeries,
  fillMonthlySeries,
  groupCities,
} from './portal-stats-shape';

const DAY_MS = 24 * 60 * 60 * 1000;
const GRAPH_DAYS = 30;
const GRAPH_MONTHS = 12;

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Публичная сводка по платформе. Кэшируем count(), чтобы гости на
 *  лендинге не грузили базу на каждый заход. */
@Injectable()
export class StatsService {
  private cache: {
    stats: CommunityStats;
    expiresAt: number;
  } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async communityStats(): Promise<CommunityStats> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) return this.cache.stats;

    const [totalMembers, totalCommunities, cities] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.community.count({ where: { status: 'active' } }),
      this.cityCounts(),
    ]);
    const stats: CommunityStats = {
      totalMembers,
      totalCities: cities.length,
      totalCommunities,
    };
    this.cache = { stats, expiresAt: now + CACHE_TTL_MS };
    return stats;
  }

  /**
   * Статистика для участников. Только портальные сущности: люди, города,
   * общины. Данные сервисов сюда не тянутся — портал не читает их таблицы,
   * см. контракт сервисного модуля.
   */
  async portalStats(now: Date = new Date()): Promise<PortalStats> {
    const since = (days: number) => new Date(now.getTime() - days * DAY_MS);
    const monthsAgo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (GRAPH_MONTHS - 1), 1),
    );

    const [
      total,
      newLast7Days,
      newLast30Days,
      activeLast7Days,
      stageGroups,
      cities,
      communities,
      settings,
      daily,
      monthly,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: since(7) } } }),
      this.prisma.user.count({ where: { createdAt: { gte: since(30) } } }),
      this.prisma.user.count({ where: { lastSeenAt: { gte: since(7) } } }),
      this.prisma.user.groupBy({
        by: ['spiritualStage'],
        _count: { _all: true },
      }),
      this.cityCounts(),
      this.prisma.community.count({ where: { status: 'active' } }),
      this.prisma.appSettings.findUnique({ where: { id: APP_SETTINGS_ID } }),
      this.registrationsByDay(since(GRAPH_DAYS)),
      this.registrationsByMonth(monthsAgo),
    ]);

    const { shown, hiddenPeople } = groupCities(cities);
    const details = settings?.donateDetails?.trim();

    return {
      people: { total, newLast7Days, newLast30Days, activeLast7Days },
      stages: stageGroups.map((row) => ({
        stage: row.spiritualStage,
        count: row._count._all,
      })),
      cities: shown,
      otherCitiesPeople: hiddenPeople,
      registrationsByDay: fillDailySeries(daily, now, GRAPH_DAYS),
      registrationsByMonth: fillMonthlySeries(monthly, now, GRAPH_MONTHS),
      communities,
      // Блок поддержки без реквизитов бессмыслен: включённый тумблер с пустым
      // полем не должен показывать пустую карточку.
      donate:
        settings?.donateEnabled && details
          ? { note: settings.donateNote?.trim() || null, details }
          : null,
    };
  }

  /**
   * Города участников. Город лежит в JSON-поле профиля, поэтому считается
   * сырым запросом: Prisma не умеет группировать по ключу внутри Json.
   */
  private async cityCounts(): Promise<
    Array<{ city: string | null; count: number }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{ city: string | null; count: bigint }>
    >`
      SELECT "homeLocation"->>'city' AS city, COUNT(*) AS count
      FROM "User"
      WHERE "accountStatus" = 'active' AND "homeLocation"->>'city' IS NOT NULL
      GROUP BY 1
    `;
    return rows.map((row) => ({ city: row.city, count: Number(row.count) }));
  }

  private async registrationsByDay(from: Date): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ period: string; count: bigint }>
    >`
      SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS period,
             COUNT(*) AS count
      FROM "User"
      WHERE "createdAt" >= ${from}
      GROUP BY 1
    `;
    return new Map(rows.map((row) => [row.period, Number(row.count)]));
  }

  private async registrationsByMonth(from: Date): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ period: string; count: bigint }>
    >`
      SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM') AS period,
             COUNT(*) AS count
      FROM "User"
      WHERE "createdAt" >= ${from}
      GROUP BY 1
    `;
    return new Map(rows.map((row) => [row.period, Number(row.count)]));
  }
}
