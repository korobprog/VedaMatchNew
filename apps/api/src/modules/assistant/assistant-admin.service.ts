import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AssistantAdminUsageDto,
  AssistantMetrics,
  AssistantSettingsDto,
  UpdateAssistantSettingsRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AssistantProviderService } from './assistant-provider.service';
import { AssistantQuotaService } from './assistant-quota.service';
import { usageDay } from './assistant-quota';
import { AssistantSettingsService } from './assistant-settings.service';

const MAX_HISTORY_DAYS = 90;
const DEFAULT_HISTORY_DAYS = 30;
const TOP_CONSUMERS = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PROMPT_EXTRA = 4_000;

/** Числовые лимиты и их границы — защита от опечатки в админке. */
const NUMERIC_LIMITS: Record<string, { min: number; max: number }> = {
  dailyMessagesPerUser: { min: 0, max: 10_000 },
  dailyTokensPerUser: { min: 0, max: 10_000_000 },
  dailyTokenBudget: { min: 0, max: 2_000_000_000 },
  dailyCostLimitUsdCents: { min: 0, max: 10_000_000 },
  maxToolRounds: { min: 0, max: 8 },
};

const BOOLEAN_KEYS = [
  'enabled',
  'aiEnabled',
  'chatHelperEnabled',
  'actionsEnabled',
] as const;

@Injectable()
export class AssistantAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AssistantSettingsService,
    private readonly quota: AssistantQuotaService,
    private readonly provider: AssistantProviderService,
  ) {}

  settingsState(): Promise<AssistantSettingsDto> {
    return this.settings.get();
  }

  updateSettings(
    patch: UpdateAssistantSettingsRequest,
  ): Promise<AssistantSettingsDto> {
    return this.settings.update(parsePatch(patch));
  }

  async resume(now = new Date()): Promise<AssistantAdminUsageDto> {
    await this.quota.resume(now);
    return this.usage(DEFAULT_HISTORY_DAYS, now);
  }

  async usage(
    days = DEFAULT_HISTORY_DAYS,
    now = new Date(),
  ): Promise<AssistantAdminUsageDto> {
    const window = Math.min(Math.max(1, Math.floor(days)), MAX_HISTORY_DAYS);
    const today = usageDay(now);
    const from = new Date(today.getTime() - (window - 1) * DAY_MS);

    const [budgetDays, consumers, metrics] = await Promise.all([
      this.prisma.assistantBudgetDay.findMany({
        where: { day: { gte: from } },
        orderBy: { day: 'desc' },
      }),
      this.prisma.assistantUsage.groupBy({
        by: ['userId'],
        where: { day: { gte: from } },
        _sum: { messages: true, tokensIn: true, tokensOut: true },
        orderBy: { _sum: { tokensIn: 'desc' } },
        take: TOP_CONSUMERS,
      }),
      this.metrics(from),
    ]);

    // Портальный профиль — только на чтение; здесь осознанно мирское имя.
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
      model: this.provider.model,
      configured: this.provider.configured,
      topConsumers: consumers.map((row) => ({
        userId: row.userId,
        name: userById.get(row.userId)?.name ?? '—',
        email: userById.get(row.userId)?.email ?? '—',
        messages: row._sum.messages ?? 0,
        tokens: (row._sum.tokensIn ?? 0) + (row._sum.tokensOut ?? 0),
      })),
      metrics,
    };
  }

  /** Как порталом пользуются через ассистента — счётчики за период. */
  private async metrics(from: Date): Promise<AssistantMetrics> {
    const [
      activeUsers,
      threads,
      questions,
      failedAnswers,
      composeRequests,
      answerTokens,
      actionsProposed,
      actionsConfirmed,
      toolGroups,
    ] = await Promise.all([
      this.prisma.assistantUsage
        .groupBy({ by: ['userId'], where: { day: { gte: from } } })
        .then((rows) => rows.length),
      this.prisma.assistantThread.count({
        where: { kind: 'chat', createdAt: { gte: from } },
      }),
      this.prisma.assistantMessage.count({
        where: {
          role: 'user',
          createdAt: { gte: from },
          thread: { kind: 'chat' },
        },
      }),
      this.prisma.assistantMessage.count({
        where: { role: 'assistant', failed: true, createdAt: { gte: from } },
      }),
      this.prisma.assistantMessage.count({
        where: {
          role: 'user',
          createdAt: { gte: from },
          thread: { kind: 'compose' },
        },
      }),
      this.prisma.assistantMessage.aggregate({
        where: { role: 'assistant', failed: false, createdAt: { gte: from } },
        _avg: { tokensIn: true, tokensOut: true },
      }),
      // Имя действия попадает в toolsUsed дважды: у ответа с карточкой
      // (предложение) и у ответа после кнопки (выполнение). Выполнения
      // считаются журналом вызовов, предложения — как разница.
      this.prisma.assistantMessage.count({
        where: {
          role: 'assistant',
          createdAt: { gte: from },
          toolsUsed: { has: 'motivation_create_reel' },
        },
      }),
      this.prisma.assistantToolCall.count({
        where: { tool: 'motivation_create_reel', createdAt: { gte: from } },
      }),
      this.prisma.assistantToolCall.groupBy({
        by: ['tool', 'service'],
        where: { createdAt: { gte: from } },
        _count: { _all: true },
        _avg: { durationMs: true },
      }),
    ]);
    const failures = await this.prisma.assistantToolCall.groupBy({
      by: ['tool'],
      where: { createdAt: { gte: from }, ok: false },
      _count: { _all: true },
    });
    const failuresByTool = new Map(
      failures.map((row) => [row.tool, row._count._all]),
    );
    return {
      activeUsers,
      threads,
      questions,
      failedAnswers,
      composeRequests,
      actionsProposed: Math.max(0, actionsProposed - actionsConfirmed),
      actionsConfirmed,
      avgTokensPerAnswer: Math.round(
        (answerTokens._avg.tokensIn ?? 0) + (answerTokens._avg.tokensOut ?? 0),
      ),
      tools: toolGroups
        .map((row) => ({
          tool: row.tool,
          service: row.service,
          calls: row._count._all,
          failures: failuresByTool.get(row.tool) ?? 0,
          avgDurationMs: Math.round(row._avg.durationMs ?? 0),
        }))
        .sort((a, b) => b.calls - a.calls),
    };
  }
}

/** Проверка правки: границы от опечатки, а не от злого умысла. */
export function parsePatch(
  patch: UpdateAssistantSettingsRequest,
): Partial<AssistantSettingsDto> {
  const result: Partial<AssistantSettingsDto> = {};
  for (const key of BOOLEAN_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    if (typeof value !== 'boolean')
      throw new BadRequestException(`Поле ${key} должно быть логическим`);
    result[key] = value;
  }
  for (const [key, bounds] of Object.entries(NUMERIC_LIMITS)) {
    const value = patch[key as keyof UpdateAssistantSettingsRequest];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isInteger(value))
      throw new BadRequestException(`Поле ${key} должно быть целым числом`);
    if (value < bounds.min || value > bounds.max)
      throw new BadRequestException(
        `Поле ${key} должно быть от ${bounds.min} до ${bounds.max}`,
      );
    (result as Record<string, number>)[key] = value;
  }
  if (patch.systemPromptExtra !== undefined) {
    if (typeof patch.systemPromptExtra !== 'string')
      throw new BadRequestException(
        'Поле systemPromptExtra должно быть строкой',
      );
    result.systemPromptExtra = patch.systemPromptExtra
      .trim()
      .slice(0, MAX_PROMPT_EXTRA);
  }
  return result;
}
