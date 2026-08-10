import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AstroSettingsValues {
  enabled: boolean;
  aiEnabled: boolean;
  dailyReadingsPerUser: number;
  dailyTokensPerUser: number;
  dailyTokenBudget: number;
  dailyCostLimitUsdCents: number;
  transitPushEnabled: boolean;
}

/**
 * Значения по умолчанию совпадают с `@default` в схеме. Дублирование намеренное:
 * строки настроек может ещё не быть, и читать настройки не должно означать её
 * создание — иначе безобидный GET начинает писать в базу.
 */
export const ASTRO_SETTINGS_DEFAULTS: AstroSettingsValues = {
  enabled: true,
  aiEnabled: true,
  dailyReadingsPerUser: 3,
  dailyTokensPerUser: 20_000,
  dailyTokenBudget: 2_000_000,
  dailyCostLimitUsdCents: 1_000,
  transitPushEnabled: true,
};

@Injectable()
export class AstroSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<AstroSettingsValues> {
    const row = await this.prisma.astroSettings.findUnique({
      where: { id: 'global' },
    });
    if (!row) return { ...ASTRO_SETTINGS_DEFAULTS };

    return {
      enabled: row.enabled,
      aiEnabled: row.aiEnabled,
      dailyReadingsPerUser: row.dailyReadingsPerUser,
      dailyTokensPerUser: row.dailyTokensPerUser,
      dailyTokenBudget: row.dailyTokenBudget,
      dailyCostLimitUsdCents: row.dailyCostLimitUsdCents,
      transitPushEnabled: row.transitPushEnabled,
    };
  }

  async update(
    patch: Partial<AstroSettingsValues>,
  ): Promise<AstroSettingsValues> {
    const current = await this.get();
    const next = { ...current, ...patch };
    await this.prisma.astroSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global', ...next },
      update: next,
    });
    return next;
  }
}
