/**
 * Решения о квоте — чистые функции. Кто спрашивает базу, тот в сервисе рядом;
 * здесь только арифметика, которую можно проверить числами.
 */

export interface QuotaSettings {
  enabled: boolean;
  aiEnabled: boolean;
  dailyMessagesPerUser: number;
  dailyTokensPerUser: number;
  dailyTokenBudget: number;
  dailyCostLimitUsdCents: number;
}

export interface TokenUsage {
  tokensIn: number;
  tokensOut: number;
}

export interface UsageSnapshot extends TokenUsage {
  messages: number;
}

export interface BudgetSnapshot extends TokenUsage {
  costUsdCents: number;
  haltedAt: Date | null;
}

export type QuotaReason =
  | 'disabled'
  | 'ai_unavailable'
  | 'not_configured'
  | 'budget_halted'
  | 'messages_exhausted'
  | 'tokens_exhausted';

export type QuotaDecision =
  { allowed: true } | { allowed: false; reason: QuotaReason };

/** Календарный день в UTC — ключ таблиц расхода. */
export function usageDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

export function overBudget(
  settings: QuotaSettings,
  budget: BudgetSnapshot | null,
): boolean {
  if (!budget) return false;
  if (
    settings.dailyTokenBudget > 0 &&
    budget.tokensIn + budget.tokensOut >= settings.dailyTokenBudget
  )
    return true;
  return (
    settings.dailyCostLimitUsdCents > 0 &&
    budget.costUsdCents >= settings.dailyCostLimitUsdCents
  );
}

/**
 * Проверяются и отметка остановки, и фактическое превышение: отметку могли
 * снять вручную, а расход при этом остался за лимитом — тогда ответы не
 * должны возобновиться сами до конца суток.
 */
export function isHalted(
  settings: QuotaSettings,
  budget: BudgetSnapshot | null,
): boolean {
  return budget?.haltedAt != null || overBudget(settings, budget);
}

export function decide(input: {
  settings: QuotaSettings;
  configured: boolean;
  usage: UsageSnapshot | null;
  budget: BudgetSnapshot | null;
}): QuotaDecision {
  const { settings, usage, budget } = input;
  if (!settings.enabled) return { allowed: false, reason: 'disabled' };
  if (!settings.aiEnabled) return { allowed: false, reason: 'ai_unavailable' };
  if (!input.configured) return { allowed: false, reason: 'not_configured' };
  if (isHalted(settings, budget))
    return { allowed: false, reason: 'budget_halted' };
  if (
    settings.dailyMessagesPerUser > 0 &&
    (usage?.messages ?? 0) >= settings.dailyMessagesPerUser
  )
    return { allowed: false, reason: 'messages_exhausted' };
  if (
    settings.dailyTokensPerUser > 0 &&
    (usage?.tokensIn ?? 0) + (usage?.tokensOut ?? 0) >=
      settings.dailyTokensPerUser
  )
    return { allowed: false, reason: 'tokens_exhausted' };
  return { allowed: true };
}

export function messagesLeft(
  settings: QuotaSettings,
  usage: UsageSnapshot | null,
): number {
  if (settings.dailyMessagesPerUser <= 0) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, settings.dailyMessagesPerUser - (usage?.messages ?? 0));
}

/** Объяснение отказа человеку. Модель тут ни при чём: формулирует портал. */
export function reasonText(reason: QuotaReason): string {
  switch (reason) {
    case 'disabled':
      return 'Ассистент сейчас выключен администрацией.';
    case 'ai_unavailable':
      return 'Ответы ассистента временно приостановлены.';
    case 'not_configured':
      return 'Ассистент ещё не настроен: нет ключа к модели.';
    case 'budget_halted':
      return 'Дневной бюджет ассистента исчерпан — он вернётся завтра.';
    case 'messages_exhausted':
      return 'Лимит вопросов на сегодня исчерпан — продолжим завтра.';
    case 'tokens_exhausted':
      return 'На сегодня вы исчерпали лимит ассистента — продолжим завтра.';
  }
}

/**
 * Стоимость в центах по ценам из окружения; без цен — ноль, и денежный
 * лимит просто не срабатывает, а токенный продолжает защищать бюджет.
 */
export function costOf(
  usage: TokenUsage,
  rates: { inCentsPerMtok: number; outCentsPerMtok: number },
): number {
  if (
    !Number.isFinite(rates.inCentsPerMtok) ||
    !Number.isFinite(rates.outCentsPerMtok)
  )
    return 0;
  return Math.round(
    (usage.tokensIn * rates.inCentsPerMtok +
      usage.tokensOut * rates.outCentsPerMtok) /
      1_000_000,
  );
}
