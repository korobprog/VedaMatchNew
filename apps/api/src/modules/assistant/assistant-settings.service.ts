import { Injectable } from '@nestjs/common';
import type { AssistantSettingsDto } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Значения по умолчанию совпадают с `@default` в схеме. Дублирование
 * намеренное: строки настроек может ещё не быть, а чтение не должно её
 * создавать — иначе безобидный GET начинает писать в базу.
 */
export const ASSISTANT_SETTINGS_DEFAULTS: AssistantSettingsDto = {
  enabled: true,
  aiEnabled: true,
  chatHelperEnabled: true,
  actionsEnabled: true,
  dailyMessagesPerUser: 40,
  dailyTokensPerUser: 80_000,
  dailyTokenBudget: 3_000_000,
  dailyCostLimitUsdCents: 1_000,
  maxToolRounds: 4,
  systemPromptExtra: '',
};

@Injectable()
export class AssistantSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<AssistantSettingsDto> {
    const row = await this.prisma.assistantSettings.findUnique({
      where: { id: 'global' },
    });
    if (!row) return { ...ASSISTANT_SETTINGS_DEFAULTS };
    return {
      enabled: row.enabled,
      aiEnabled: row.aiEnabled,
      chatHelperEnabled: row.chatHelperEnabled,
      actionsEnabled: row.actionsEnabled,
      dailyMessagesPerUser: row.dailyMessagesPerUser,
      dailyTokensPerUser: row.dailyTokensPerUser,
      dailyTokenBudget: row.dailyTokenBudget,
      dailyCostLimitUsdCents: row.dailyCostLimitUsdCents,
      maxToolRounds: row.maxToolRounds,
      systemPromptExtra: row.systemPromptExtra,
    };
  }

  async update(
    patch: Partial<AssistantSettingsDto>,
  ): Promise<AssistantSettingsDto> {
    const current = await this.get();
    const next = { ...current, ...patch };
    await this.prisma.assistantSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global', ...next },
      update: next,
    });
    return next;
  }
}
