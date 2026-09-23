import type { WellnessCheckReason } from '@vedamatch/shared';

/**
 * Настройки и деньги автопроверки (VED-384).
 *
 * Каждая проверка — платный поиск: в живой пробе один вызов с поиском съел
 * ~37 тысяч входных токенов (чужие страницы идут во вход модели). Поэтому
 * ограничений три, и все считаются до вызова: дневной бюджет в долларах,
 * дневное число проверок (оно держит бюджет, даже когда цены не заданы) и
 * число карточек от одного человека за сутки.
 */

export interface CheckSettings {
  /** `WELLNESS_AUTO_CHECK=0` — автопроверка выключена, всё идёт человеку. */
  enabled: boolean;
  model: string;
  /** Цены провайдера: центы за миллион токенов и за один поиск. */
  rates: {
    inCentsPerMtok: number;
    outCentsPerMtok: number;
    centsPerSearch: number;
  };
  dailyBudgetUsdMicros: number;
  dailyChecks: number;
  userDailyChecks: number;
}

function nonNegative(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Чтение из окружения. Пустая строка — «не задано», а не ноль: compose
 * пробрасывает незаданную переменную пустой, и она не должна обнулять лимит.
 */
export function readCheckSettings(
  env: Record<string, string | undefined>,
): CheckSettings {
  return {
    enabled: env.WELLNESS_AUTO_CHECK !== '0',
    // Модель, на которой поиск через релей проверен живым вызовом.
    model: env.WELLNESS_SEARCH_MODEL?.trim() || 'gpt-5.4',
    rates: {
      inCentsPerMtok: nonNegative(env.WELLNESS_AI_USD_CENTS_PER_MTOK_IN, 0),
      outCentsPerMtok: nonNegative(env.WELLNESS_AI_USD_CENTS_PER_MTOK_OUT, 0),
      // У OpenAI поиск стоит $10 за тысячу вызовов — цент за штуку.
      centsPerSearch: nonNegative(env.WELLNESS_AI_USD_CENTS_PER_SEARCH, 1),
    },
    dailyBudgetUsdMicros: Math.round(
      nonNegative(env.WELLNESS_AI_DAILY_BUDGET_CENTS, 300) * 10_000,
    ),
    dailyChecks: Math.floor(nonNegative(env.WELLNESS_AI_DAILY_CHECKS, 40)),
    userDailyChecks: Math.floor(
      nonNegative(env.WELLNESS_AI_USER_DAILY_CHECKS, 5),
    ),
  };
}

/**
 * Стоимость одной проверки в миллионных долях доллара. Цент — 10 000
 * микродолларов; токены считаются по цене за миллион.
 */
export function checkCostUsdMicros(
  usage: { inputTokens: number; outputTokens: number },
  searchCalls: number,
  rates: CheckSettings['rates'],
): number {
  const tokenCents =
    (usage.inputTokens * rates.inCentsPerMtok +
      usage.outputTokens * rates.outCentsPerMtok) /
    1_000_000;
  return Math.round((tokenCents + searchCalls * rates.centsPerSearch) * 10_000);
}

/**
 * Можно ли ставить карточку в очередь. Отказ — не ошибка для человека:
 * карточка просто сразу идёт модератору, и уведомление говорит почему.
 */
export function admitToQueue(input: {
  settings: CheckSettings;
  providerConfigured: boolean;
  userChecksToday: number;
}): WellnessCheckReason | null {
  if (!input.settings.enabled || !input.providerConfigured) {
    return 'ai_unavailable';
  }
  if (input.userChecksToday >= input.settings.userDailyChecks) {
    return 'user_daily_limit';
  }
  return null;
}

/**
 * Можно ли тратить деньги прямо сейчас — проверяется воркером перед вызовом,
 * а не при постановке: за время ожидания бюджет мог кончиться.
 */
export function admitToRun(input: {
  settings: CheckSettings;
  spentTodayUsdMicros: number;
  checksRunToday: number;
}): WellnessCheckReason | null {
  if (input.checksRunToday >= input.settings.dailyChecks) return 'daily_budget';
  if (
    input.settings.dailyBudgetUsdMicros > 0 &&
    input.spentTodayUsdMicros >= input.settings.dailyBudgetUsdMicros
  ) {
    return 'daily_budget';
  }
  return null;
}

/** Начало суток по UTC — граница «сегодня» для всех лимитов. */
export function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}
