import type {
  WorkLineItemKind,
  WorkOvertimeMode,
  WorkPricingModel,
} from '@vedamatch/shared';

/**
 * Деньги коммерческой доски (VED-458) — чистый расчёт без базы.
 *
 * Норма считается на исполнителя за календарный день по всей доске, а не по
 * задаче: иначе три задачи по три часа дали бы девять часов «в норме». Поэтому
 * «в норме» и «сверх нормы» не хранятся в записях, а выводятся заново из всех
 * записей человека за сутки — правка одной записи задним числом тогда не
 * требует пересчёта соседних.
 *
 * Сутки — по поясу доски: работа с 23:00 до 01:00 по Москве — это два дня.
 */

const MINUTE_MS = 60_000;

export interface WorkFinanceRules {
  pricingModel: WorkPricingModel;
  rateMinor: number;
  dailyNormMinutes: number;
  overtimeRateMinor: number;
  overtimeMode: WorkOvertimeMode;
  timezone: string;
}

/** Отрезок работы; у идущего таймера `endedAt` уже подставлен текущим временем. */
export interface WorkTimeSpan {
  id: string;
  userId: string | null;
  startedAt: Date;
  endedAt: Date;
}

export interface WorkSpanSplit {
  minutes: number;
  normalMinutes: number;
  overtimeMinutes: number;
}

/** Сдвиг пояса от UTC в миллисекундах в данный момент. */
function zoneOffsetMs(at: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(at));
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** Календарная дата в поясе доски: `2026-09-24`. */
export function workLocalDay(at: Date, timezone: string): string {
  const local = new Date(at.getTime() + zoneOffsetMs(at.getTime(), timezone));
  return local.toISOString().slice(0, 10);
}

/** Ближайшая полночь в поясе доски строго после `at`. */
export function workNextLocalMidnight(at: Date, timezone: string): Date {
  const [year, month, day] = workLocalDay(at, timezone).split('-').map(Number);
  const midnightAsUtc = Date.UTC(year, month - 1, day + 1);
  // Сдвиг берётся дважды: на границе перехода на летнее время первый
  // замер делается по другую сторону перехода.
  const guess = midnightAsUtc - zoneOffsetMs(midnightAsUtc, timezone);
  return new Date(midnightAsUtc - zoneOffsetMs(guess, timezone));
}

/** Отрезок по суткам пояса: сколько миллисекунд пришлось на каждый день. */
export function workSplitByLocalDay(
  startedAt: Date,
  endedAt: Date,
  timezone: string,
): Array<{ day: string; ms: number }> {
  const parts: Array<{ day: string; ms: number }> = [];
  let cursor = startedAt.getTime();
  const end = endedAt.getTime();
  while (cursor < end) {
    const at = new Date(cursor);
    const next = Math.min(workNextLocalMidnight(at, timezone).getTime(), end);
    parts.push({ day: workLocalDay(at, timezone), ms: next - cursor });
    cursor = next;
  }
  return parts;
}

/**
 * Сколько минут каждой записи пришлось на норму, а сколько сверх. Записи
 * человека за сутки идут по времени начала: первые `dailyNormMinutes` — норма,
 * остальное сверх. Норма 0 значит «нормы нет»: всё по обычной ставке.
 */
export function workClassifySpans(
  spans: WorkTimeSpan[],
  dailyNormMinutes: number,
  timezone: string,
): Map<string, WorkSpanSplit> {
  const normMs = dailyNormMinutes * MINUTE_MS;
  const usedByUserDay = new Map<string, number>();
  const result = new Map<string, WorkSpanSplit>();

  const ordered = [...spans].sort(
    (a, b) =>
      a.startedAt.getTime() - b.startedAt.getTime() || a.id.localeCompare(b.id),
  );
  for (const span of ordered) {
    const totalMs = Math.max(
      0,
      span.endedAt.getTime() - span.startedAt.getTime(),
    );
    let normalMs = 0;
    for (const part of workSplitByLocalDay(
      span.startedAt,
      span.endedAt,
      timezone,
    )) {
      if (normMs <= 0) {
        normalMs += part.ms;
        continue;
      }
      const key = `${span.userId ?? ''}|${part.day}`;
      const used = usedByUserDay.get(key) ?? 0;
      normalMs += Math.min(part.ms, Math.max(0, normMs - used));
      usedByUserDay.set(key, used + part.ms);
    }
    // Минуты округляются один раз на запись, и сверх нормы — остаток: так
    // «в норме» и «сверх» всегда складываются ровно в длину записи.
    const minutes = Math.round(totalMs / MINUTE_MS);
    const normalMinutes = Math.min(minutes, Math.round(normalMs / MINUTE_MS));
    result.set(span.id, {
      minutes,
      normalMinutes,
      overtimeMinutes: minutes - normalMinutes,
    });
  }
  return result;
}

/** Стоимость минут по часовой ставке, до копейки. */
export function workMinutesCost(minutes: number, rateMinor: number): number {
  return Math.round((minutes * rateMinor) / 60);
}

/**
 * Сколько стоит одна запись. При фиксированной цене время не оплачивается —
 * оно учитывается, но деньги несёт цена задачи. Сверх нормы по запросу в счёт
 * не идёт, пока ведущий не одобрит (одобрение — следующий шаг, VED-459).
 */
export function workSpanCost(
  split: WorkSpanSplit,
  rules: WorkFinanceRules,
): number {
  if (rules.pricingModel === 'fixed') return 0;
  const normal = workMinutesCost(split.normalMinutes, rules.rateMinor);
  const overtime =
    rules.overtimeMode === 'auto'
      ? workMinutesCost(split.overtimeMinutes, rules.overtimeRateMinor)
      : 0;
  return normal + overtime;
}

export interface WorkLineItemAmount {
  kind: WorkLineItemKind;
  amountMinor: number;
}

export interface WorkTaskTotals {
  minutes: number;
  normalMinutes: number;
  overtimeMinutes: number;
  pendingOvertimeMinutes: number;
  workMinor: number;
  expensesMinor: number;
  discountMinor: number;
  totalMinor: number;
}

/**
 * Итог задачи. Работа — сумма записей (а не минуты, умноженные разом), чтобы
 * итог сходился с суммами строк до копейки. Скидка не уводит итог ниже нуля.
 */
export function workTaskTotals(
  splits: WorkSpanSplit[],
  lineItems: WorkLineItemAmount[],
  rules: WorkFinanceRules,
  priceMinor: number | null,
): WorkTaskTotals {
  let minutes = 0;
  let normalMinutes = 0;
  let overtimeMinutes = 0;
  let spansMinor = 0;
  for (const split of splits) {
    minutes += split.minutes;
    normalMinutes += split.normalMinutes;
    overtimeMinutes += split.overtimeMinutes;
    spansMinor += workSpanCost(split, rules);
  }
  const workMinor =
    rules.pricingModel === 'fixed' ? (priceMinor ?? 0) : spansMinor;
  const sumOf = (kind: WorkLineItemKind) =>
    lineItems
      .filter((item) => item.kind === kind)
      .reduce((sum, item) => sum + item.amountMinor, 0);
  const expensesMinor = sumOf('expense');
  const discountMinor = sumOf('discount');
  return {
    minutes,
    normalMinutes,
    overtimeMinutes,
    pendingOvertimeMinutes:
      rules.pricingModel === 'hourly' && rules.overtimeMode === 'on_request'
        ? overtimeMinutes
        : 0,
    workMinor,
    expensesMinor,
    discountMinor,
    totalMinor: Math.max(0, workMinor + expensesMinor - discountMinor),
  };
}

/** Оценка задачи деньгами: по ставке в норме либо фиксированная цена. */
export function workEstimateCost(
  estimateMinutes: number | null,
  priceMinor: number | null,
  rules: WorkFinanceRules,
): number | null {
  if (rules.pricingModel === 'fixed') return priceMinor;
  return estimateMinutes === null
    ? null
    : workMinutesCost(estimateMinutes, rules.rateMinor);
}
