import type {
  TravelCashCategoryDto,
  TravelCashEntryDto,
  TravelCashGrouping,
  TravelCashIcon,
  TravelCashKind,
} from "@vedamatch/shared";
import { formatDay, periodKey, periodLabel } from "./cash-grouping";

/**
 * Статистика кассы из записей за промежуток. Считается на вебе из той же
 * ленты, что и главный экран: отдельный серверный отчёт разошёлся бы с
 * кассой при первой же правке.
 */

export const CASH_STATS_PRESETS = [
  "month",
  "30days",
  "quarter",
  "year",
  "3years",
] as const;
export type CashStatsPreset = (typeof CASH_STATS_PRESETS)[number];

export const CASH_STATS_PRESET_LABELS: Record<CashStatsPreset, string> = {
  month: "Этот месяц",
  "30days": "30 дней",
  quarter: "3 месяца",
  year: "Этот год",
  "3years": "3 года",
};

function parseDay(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Промежуток и шаг графика для пресета. Шаг подобран так, чтобы столбцов было
 * от 3 до ~36: по дням за три года график превращается в штрихкод.
 */
export function statsRange(
  preset: CashStatsPreset,
  today: string,
): { from: string; to: string; grouping: TravelCashGrouping } {
  const to = parseDay(today);
  const y = to.getUTCFullYear();
  const m = to.getUTCMonth();
  switch (preset) {
    case "month":
      return {
        from: formatDay(new Date(Date.UTC(y, m, 1))),
        to: today,
        grouping: "day",
      };
    case "30days":
      return {
        from: formatDay(new Date(to.getTime() - 29 * 86_400_000)),
        to: today,
        grouping: "day",
      };
    case "quarter":
      return {
        from: formatDay(new Date(Date.UTC(y, m - 2, 1))),
        to: today,
        grouping: "week",
      };
    case "year":
      return {
        from: formatDay(new Date(Date.UTC(y, 0, 1))),
        to: today,
        grouping: "month",
      };
    case "3years":
      return {
        from: formatDay(new Date(Date.UTC(y - 2, 0, 1))),
        to: today,
        grouping: "month",
      };
  }
}

export interface CashTotals {
  incomeMinor: number;
  expenseMinor: number;
}

export function totalsOf(entries: TravelCashEntryDto[]): CashTotals {
  return entries.reduce<CashTotals>(
    (totals, entry) => {
      if (entry.kind === "income") totals.incomeMinor += entry.amountMinor;
      else totals.expenseMinor += entry.amountMinor;
      return totals;
    },
    { incomeMinor: 0, expenseMinor: 0 },
  );
}

export interface CategoryTotal {
  /** null — записи без статьи. */
  categoryId: string | null;
  name: string;
  icon: TravelCashIcon;
  amountMinor: number;
  count: number;
  /** Доля в доходах или расходах периода, 0..1. */
  share: number;
}

/**
 * Разбивка по статьям внутри вида: крупные сверху. Удалённая статья и запись
 * без статьи — в одной строке «Без статьи»: деньги из итога не выпадают.
 */
export function categoryTotals(
  entries: TravelCashEntryDto[],
  categories: TravelCashCategoryDto[],
  kind: TravelCashKind,
): CategoryTotal[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const rows = new Map<string, CategoryTotal>();
  let total = 0;
  for (const entry of entries) {
    if (entry.kind !== kind) continue;
    const category = entry.categoryId ? byId.get(entry.categoryId) : undefined;
    const key = category?.id ?? "none";
    const row = rows.get(key) ?? {
      categoryId: category?.id ?? null,
      name: category?.name ?? "Без статьи",
      icon: category?.icon ?? "other",
      amountMinor: 0,
      count: 0,
      share: 0,
    };
    row.amountMinor += entry.amountMinor;
    row.count += 1;
    total += entry.amountMinor;
    rows.set(key, row);
  }
  return [...rows.values()]
    .map((row) => ({ ...row, share: total ? row.amountMinor / total : 0 }))
    .sort(
      (a, b) =>
        b.amountMinor - a.amountMinor || a.name.localeCompare(b.name, "ru"),
    );
}

export interface PeriodTotal extends CashTotals {
  key: string;
  label: string;
}

/**
 * Доход и расход по периодам, от старых к новым — так читается график.
 * Пустые периоды внутри промежутка заполняются нулями: провал в столбцах
 * тоже информация, и без него соседние месяцы визуально слипаются.
 */
export function periodTotals(
  entries: TravelCashEntryDto[],
  grouping: TravelCashGrouping,
  from: string,
  to: string,
): PeriodTotal[] {
  const rows = new Map<string, PeriodTotal>();
  const end = parseDay(to);
  for (
    let day = parseDay(from);
    day <= end;
    day = new Date(day.getTime() + 86_400_000)
  ) {
    const key = periodKey(formatDay(day), grouping);
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        label: periodLabel(key, grouping),
        incomeMinor: 0,
        expenseMinor: 0,
      });
    }
  }
  for (const entry of entries) {
    const row = rows.get(periodKey(entry.occurredOn, grouping));
    if (!row) continue;
    if (entry.kind === "income") row.incomeMinor += entry.amountMinor;
    else row.expenseMinor += entry.amountMinor;
  }
  return [...rows.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Округлённый вверх «красивый» максимум оси: 1, 2 или 5 × 10ⁿ. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) {
    if (value <= step * power) return step * power;
  }
  return 10 * power;
}
