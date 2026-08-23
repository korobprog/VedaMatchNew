import { Injectable } from '@nestjs/common';
import type { AdminRewardsSettingsDto } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/** Единственная строка настроек модуля. */
export const REWARDS_SETTINGS_ID = 'global';

/**
 * Номиналы и лимиты. Живут в базе, а не в константах: экономика беты
 * меняется быстрее релизов, и «поправить 30 на 25» не должно стоить деплоя.
 */
@Injectable()
export class RewardsSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Настройки с гарантированной строкой. `upsert` вместо `findUnique`
   * с дефолтами в коде: дефолт в двух местах разъезжается, а строка,
   * созданная при первом чтении, показывается в админке сразу.
   */
  async read() {
    return this.prisma.rewardsSettings.upsert({
      where: { id: REWARDS_SETTINGS_ID },
      update: {},
      create: { id: REWARDS_SETTINGS_ID },
    });
  }

  async dto(): Promise<AdminRewardsSettingsDto> {
    const row = await this.read();
    return {
      levelOnePoints: row.levelOnePoints,
      levelTwoPoints: row.levelTwoPoints,
      welcomePoints: row.welcomePoints,
      monthlyCapPoints: row.monthlyCapPoints,
      accrualDelayHours: row.accrualDelayHours,
      qualifyMinDays: row.qualifyMinDays,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
