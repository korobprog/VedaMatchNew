import type { TravelCashIcon, TravelCashKind } from '@vedamatch/shared';

/**
 * Статьи, с которыми касса открывается впервые. Хозяин хостела не должен
 * начинать учёт с заведения справочника: первая запись вносится сразу, а
 * лишнее он переименует или удалит.
 */
export const DEFAULT_CASH_CATEGORIES: readonly {
  kind: TravelCashKind;
  name: string;
  icon: TravelCashIcon;
}[] = [
  { kind: 'income', name: 'Проживание', icon: 'house' },
  { kind: 'income', name: 'Пожертвования', icon: 'gift' },
  { kind: 'income', name: 'Прочий доход', icon: 'banknote' },
  { kind: 'expense', name: 'Продукты', icon: 'food' },
  { kind: 'expense', name: 'Хозтовары', icon: 'cleaning' },
  { kind: 'expense', name: 'Стирка', icon: 'laundry' },
  { kind: 'expense', name: 'Ремонт', icon: 'repair' },
  { kind: 'expense', name: 'Коммунальные', icon: 'utilities' },
  { kind: 'expense', name: 'Связь и интернет', icon: 'internet' },
  { kind: 'expense', name: 'Реклама', icon: 'ads' },
  { kind: 'expense', name: 'Зарплата', icon: 'salary' },
  { kind: 'expense', name: 'Прочий расход', icon: 'other' },
];

/** Сумма по виду записи — ровно то, что отдаёт `groupBy` Prisma. */
export interface CashKindSum {
  kind: TravelCashKind;
  amountMinor: number | null;
}

/**
 * Остаток: начальный плюс доходы минус расходы. Пустая сумма группы (`null`
 * у `_sum`, когда записей нет) считается нулём, а не ломает итог в NaN.
 */
export function cashBalance(openingMinor: number, sums: CashKindSum[]): number {
  return sums.reduce(
    (total, row) =>
      row.kind === 'income'
        ? total + (row.amountMinor ?? 0)
        : total - (row.amountMinor ?? 0),
    openingMinor,
  );
}
