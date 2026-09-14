import type {
  SaveTravelCashEntryRequest,
  SaveTravelCashTemplateRequest,
  TravelCashCategoryDto,
  TravelCashEntryDto,
  TravelCashFilters,
  TravelCashTemplateDto,
  TravelGuestDto,
} from "@vedamatch/shared";
import { formatPrice } from "./price";

/**
 * Фильтры, выбор нескольких записей, дублирование и шаблоны — чистой логикой
 * без React. Экран кассы только раскладывает это по кнопкам.
 */

export type CashFilterKey = keyof TravelCashFilters;

/** Параметры запроса ленты: пустые поля не отправляются. */
export function filtersToQuery(
  filters: TravelCashFilters,
): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    query[key] = String(value);
  }
  return query;
}

export function hasFilters(filters: TravelCashFilters): boolean {
  return Object.keys(filtersToQuery(filters)).length > 0;
}

export function withoutFilter(
  filters: TravelCashFilters,
  key: CashFilterKey,
): TravelCashFilters {
  const next = { ...filters };
  delete next[key];
  return next;
}

export interface FilterChip {
  key: CashFilterKey;
  label: string;
}

/**
 * Подписи активных фильтров — кнопки «сбросить» над лентой. Имена статей и
 * гостей подставляются из справочников, id человеку ничего не говорит.
 */
export function filterChips(
  filters: TravelCashFilters,
  categories: TravelCashCategoryDto[],
  guests: Pick<TravelGuestDto, "id" | "fullName">[],
  currency: Parameters<typeof formatPrice>[1],
): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.q) chips.push({ key: "q", label: `«${filters.q}»` });
  if (filters.kind) {
    chips.push({
      key: "kind",
      label: filters.kind === "income" ? "Доходы" : "Расходы",
    });
  }
  if (filters.categoryId) {
    const name =
      filters.categoryId === "none"
        ? "Без статьи"
        : (categories.find((c) => c.id === filters.categoryId)?.name ??
          "Статья");
    chips.push({ key: "categoryId", label: name });
  }
  if (filters.guestId) {
    chips.push({
      key: "guestId",
      label: guests.find((g) => g.id === filters.guestId)?.fullName ?? "Гость",
    });
  }
  if (filters.tag) chips.push({ key: "tag", label: `#${filters.tag}` });
  if (filters.minMinor !== undefined) {
    chips.push({
      key: "minMinor",
      label: `от ${formatPrice(filters.minMinor, currency)}`,
    });
  }
  if (filters.maxMinor !== undefined) {
    chips.push({
      key: "maxMinor",
      label: `до ${formatPrice(filters.maxMinor, currency)}`,
    });
  }
  return chips;
}

export interface SelectionTotals {
  count: number;
  incomeMinor: number;
  expenseMinor: number;
}

/** Итог по выбранным записям — видно, сколько удалится или сложится. */
export function selectionTotals(
  entries: TravelCashEntryDto[],
  selected: ReadonlySet<string>,
): SelectionTotals {
  return entries.reduce<SelectionTotals>(
    (totals, entry) => {
      if (!selected.has(entry.id)) return totals;
      totals.count += 1;
      if (entry.kind === "income") totals.incomeMinor += entry.amountMinor;
      else totals.expenseMinor += entry.amountMinor;
      return totals;
    },
    { count: 0, incomeMinor: 0, expenseMinor: 0 },
  );
}

/**
 * Черновик новой записи из существующей. Дата — сегодняшняя: дубль вносят,
 * когда то же самое повторилось сегодня. Сутки у дубля оставляем — «ещё
 * столько же суток» и есть частый случай.
 */
export function duplicateOf(
  entry: TravelCashEntryDto,
  today: string,
): SaveTravelCashEntryRequest {
  return {
    kind: entry.kind,
    amountMinor: entry.amountMinor,
    occurredOn: today,
    categoryId: entry.categoryId,
    note: entry.note,
    tags: entry.tags,
    guestId: entry.guestId,
    nights: entry.nights,
  };
}

/**
 * Шаблон из записи. Гость и сутки в шаблон не переходят: шаблон — про
 * статью и сумму, а гость у каждой оплаты свой.
 */
export function templateOf(
  entry: TravelCashEntryDto,
  name: string,
): SaveTravelCashTemplateRequest {
  return {
    name: name.trim(),
    kind: entry.kind,
    amountMinor: entry.amountMinor,
    categoryId: entry.categoryId,
    note: entry.note,
    tags: entry.tags,
  };
}

/** Подпись шаблона на кнопке: название и сумма, если она задана. */
export function templateLabel(
  template: TravelCashTemplateDto,
  currency: Parameters<typeof formatPrice>[1],
): string {
  const price = formatPrice(template.amountMinor, currency);
  return price ? `${template.name} · ${price}` : template.name;
}
