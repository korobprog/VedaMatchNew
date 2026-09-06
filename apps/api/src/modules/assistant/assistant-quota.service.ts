import { Injectable, Logger } from '@nestjs/common';
import type { AssistantQuotaState } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AssistantSettingsService } from './assistant-settings.service';
import { AssistantProviderService } from './assistant-provider.service';
import {
  costOf,
  decide,
  isHalted,
  messagesLeft,
  overBudget,
  reasonText,
  usageDay,
  type QuotaDecision,
  type TokenUsage,
} from './assistant-quota';

/**
 * Учёт расхода и защита бюджета — по образцу Astro: дневная квота человека,
 * общий дневной бюджет портала и аварийный выключатель.
 */
@Injectable()
export class AssistantQuotaService {
  private readonly logger = new Logger(AssistantQuotaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AssistantSettingsService,
    private readonly provider: AssistantProviderService,
  ) {}

  async state(userId: string, now = new Date()): Promise<AssistantQuotaState> {
    const settings = await this.settings.get();
    const day = usageDay(now);
    const [usage, budget] = await Promise.all([
      this.prisma.assistantUsage.findUnique({
        where: { userId_day: { userId, day } },
      }),
      this.prisma.assistantBudgetDay.findUnique({ where: { day } }),
    ]);
    const decision = decide({
      settings,
      configured: this.provider.configured,
      usage,
      budget,
    });
    return {
      messagesLeft: messagesLeft(settings, usage),
      messagesPerDay: settings.dailyMessagesPerUser,
      available: decision.allowed,
      budgetHalted: isHalted(settings, budget),
      unavailableReason: decision.allowed ? null : reasonText(decision.reason),
    };
  }

  /** Проверка ПЕРЕД обращением к провайдеру: платить за отказ не хочется. */
  async check(userId: string, now = new Date()): Promise<QuotaDecision> {
    const settings = await this.settings.get();
    const day = usageDay(now);
    const [usage, budget] = await Promise.all([
      this.prisma.assistantUsage.findUnique({
        where: { userId_day: { userId, day } },
      }),
      this.prisma.assistantBudgetDay.findUnique({ where: { day } }),
    ]);
    return decide({
      settings,
      configured: this.provider.configured,
      usage,
      budget,
    });
  }

  /**
   * Фактический расход ПОСЛЕ ответа: списывается потраченное, а не
   * запрошенное. Аварийная остановка ставится здесь же.
   */
  async record(
    userId: string,
    usage: TokenUsage & { toolCalls: number },
    now = new Date(),
  ): Promise<void> {
    const settings = await this.settings.get();
    const day = usageDay(now);
    const costUsdCents = costOf(usage, this.provider.rates);

    await this.prisma.assistantUsage.upsert({
      where: { userId_day: { userId, day } },
      create: {
        userId,
        day,
        messages: 1,
        toolCalls: usage.toolCalls,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
      },
      update: {
        messages: { increment: 1 },
        toolCalls: { increment: usage.toolCalls },
        tokensIn: { increment: usage.tokensIn },
        tokensOut: { increment: usage.tokensOut },
      },
    });

    const budget = await this.prisma.assistantBudgetDay.upsert({
      where: { day },
      create: {
        day,
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costUsdCents,
      },
      update: {
        tokensIn: { increment: usage.tokensIn },
        tokensOut: { increment: usage.tokensOut },
        costUsdCents: { increment: costUsdCents },
      },
    });

    if (!budget.haltedAt && overBudget(settings, budget)) {
      await this.prisma.assistantBudgetDay.update({
        where: { day },
        data: { haltedAt: now },
      });
      this.logger.warn(
        `Дневной бюджет ассистента исчерпан (${budget.tokensIn + budget.tokensOut} токенов, ${budget.costUsdCents} центов) — ответы остановлены до конца суток`,
      );
    } else if (usage.tokensIn + usage.tokensOut === 0) {
      this.logger.warn('Провайдер не вернул расход токенов; учёт неполон');
    }
  }

  /** Снятие аварийной остановки вручную из админки. */
  async resume(now = new Date()): Promise<void> {
    await this.prisma.assistantBudgetDay.updateMany({
      where: { day: usageDay(now) },
      data: { haltedAt: null },
    });
  }
}
