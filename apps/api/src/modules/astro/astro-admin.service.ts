import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AstroAdminUsageDto,
  AstroSettingsDto,
  AstroSubjectsStats,
  UpdateAstroSettingsRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AstroQuotaService, usageDay } from './astro-quota.service';
import { AstroSettingsService } from './astro-settings.service';

const MAX_HISTORY_DAYS = 90;
const DEFAULT_HISTORY_DAYS = 30;
const TOP_CONSUMERS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Числовые лимиты и их допустимые границы. Верхние — защита от опечатки в админке. */
const NUMERIC_LIMITS: Record<string, { min: number; max: number }> = {
  dailyReadingsPerUser: { min: 0, max: 1_000 },
  dailyTokensPerUser: { min: 0, max: 10_000_000 },
  dailyTokenBudget: { min: 0, max: 2_000_000_000 },
  dailyCostLimitUsdCents: { min: 0, max: 10_000_000 },
};

const BOOLEAN_KEYS = ['enabled', 'aiEnabled', 'transitPushEnabled'] as const;

@Injectable()
export class AstroAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AstroSettingsService,
    private readonly quota: AstroQuotaService,
  ) {}

  settingsState(): Promise<AstroSettingsDto> {
    return this.settings.get();
  }

  async updateSettings(
    patch: UpdateAstroSettingsRequest,
  ): Promise<AstroSettingsDto> {
    return this.settings.update(this.parsePatch(patch));
  }

  /** Снять аварийную остановку вручную. */
  async resume(now: Date = new Date()): Promise<AstroAdminUsageDto> {
    await this.quota.resume(now);
    return this.usage(DEFAULT_HISTORY_DAYS, now);
  }

  async usage(
    days = DEFAULT_HISTORY_DAYS,
    now: Date = new Date(),
  ): Promise<AstroAdminUsageDto> {
    const window = Math.min(Math.max(1, Math.floor(days)), MAX_HISTORY_DAYS);
    const today = usageDay(now);
    const from = new Date(today.getTime() - (window - 1) * DAY_MS);

    const [budgetDays, consumers, subjects] = await Promise.all([
      this.prisma.astroBudgetDay.findMany({
        where: { day: { gte: from } },
        orderBy: { day: 'desc' },
      }),
      this.prisma.astroUsage.groupBy({
        by: ['userId'],
        where: { day: { gte: from } },
        _sum: { readings: true, tokensIn: true, tokensOut: true },
        orderBy: { _sum: { tokensIn: 'desc' } },
        take: TOP_CONSUMERS,
      }),
      this.subjectStats(from),
    ]);

    // Портальный профиль читается только на чтение — так велит контракт сервиса.
    const users = await this.prisma.user.findMany({
      where: { id: { in: consumers.map((row) => row.userId) } },
      select: { id: true, name: true, email: true },
    });
    const userById = new Map(users.map((user) => [user.id, user]));

    const todayRow = budgetDays.find(
      (row) => row.day.getTime() === today.getTime(),
    );

    return {
      days: budgetDays.map((row) => ({
        day: row.day.toISOString().slice(0, 10),
        tokensIn: row.tokensIn,
        tokensOut: row.tokensOut,
        costUsdCents: row.costUsdCents,
        halted: row.haltedAt !== null,
      })),
      today: {
        tokensIn: todayRow?.tokensIn ?? 0,
        tokensOut: todayRow?.tokensOut ?? 0,
        costUsdCents: todayRow?.costUsdCents ?? 0,
        halted: todayRow?.haltedAt != null,
      },
      topConsumers: consumers.map((row) => ({
        userId: row.userId,
        name: userById.get(row.userId)?.name ?? '—',
        email: userById.get(row.userId)?.email ?? '—',
        readings: row._sum.readings ?? 0,
        tokens: (row._sum.tokensIn ?? 0) + (row._sum.tokensOut ?? 0),
      })),
      subjects,
    };
  }

  /**
   * Объём книг карт: сколько записей, у скольких владельцев и какая книга самая
   * большая. Содержимое не читается — записи видны только владельцу, а лимита
   * на их число нет, поэтому админке нужен хотя бы счётчик роста.
   */
  private async subjectStats(from: Date): Promise<AstroSubjectsStats> {
    const [byOwner, createdInWindow] = await Promise.all([
      this.prisma.astroSubject.groupBy({
        by: ['ownerId'],
        _count: { _all: true },
      }),
      this.prisma.astroSubject.count({ where: { createdAt: { gte: from } } }),
    ]);

    const counts = byOwner.map((row) => row._count._all);
    return {
      total: counts.reduce((sum, value) => sum + value, 0),
      owners: counts.length,
      createdInWindow,
      largestBook: counts.length === 0 ? 0 : Math.max(...counts),
    };
  }

  /**
   * Проверка правки. Границы нужны не от злого умысла, а от опечатки: лишний ноль
   * в дневном бюджете стоит реальных денег, и заметить его постфактум трудно.
   */
  private parsePatch(
    patch: UpdateAstroSettingsRequest,
  ): Partial<AstroSettingsDto> {
    const result: Partial<AstroSettingsDto> = {};

    for (const key of BOOLEAN_KEYS) {
      const value = patch[key];
      if (value === undefined) continue;
      if (typeof value !== 'boolean') {
        throw new BadRequestException(`Поле ${key} должно быть логическим`);
      }
      result[key] = value;
    }

    for (const [key, bounds] of Object.entries(NUMERIC_LIMITS)) {
      const value = patch[key as keyof UpdateAstroSettingsRequest];
      if (value === undefined) continue;
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new BadRequestException(`Поле ${key} должно быть целым числом`);
      }
      if (value < bounds.min || value > bounds.max) {
        throw new BadRequestException(
          `Поле ${key} должно быть от ${bounds.min} до ${bounds.max}`,
        );
      }
      (result as Record<string, number>)[key] = value;
    }

    return result;
  }
}
