import type { MarketCurrency } from '@vedamatch/shared';

/** Строка корзины в том виде, в каком её достали из базы вместе с объявлением. */
export interface CartRow {
  listingId: string;
  quantity: number;
  shopId: string;
  currency: MarketCurrency;
  priceMinor: number | null;
  available: boolean;
}

export interface CartGroupKey {
  shopId: string;
  currency: MarketCurrency;
}

export interface CartGroup extends CartGroupKey {
  rows: CartRow[];
  subtotalMinor: number;
}

/**
 * Ключ группы — пара «магазин + валюта», а не один магазин.
 *
 * Магазин может выставить часть товара в рублях, а часть в рупиях. Сложить их
 * в один `totalMinor` нельзя: получится бессмысленное число, по которому потом
 * не посчитать ни сумму заявки, ни статистику. Поэтому такая корзина
 * превращается в две заявки одному и тому же продавцу.
 */
export function groupKey(key: CartGroupKey): string {
  return `${key.shopId}:${key.currency}`;
}

export function parseGroupKey(value: string): CartGroupKey | null {
  const separator = value.lastIndexOf(':');
  if (separator <= 0) return null;
  return {
    shopId: value.slice(0, separator),
    currency: value.slice(separator + 1) as MarketCurrency,
  };
}

/**
 * Делит корзину на группы. Недоступные позиции в группы не попадают: их
 * показывают отдельно, чтобы человек понял, почему сумма изменилась, но
 * в заявку они не идут.
 *
 * Порядок групп повторяет порядок первого появления магазина в корзине —
 * так список не прыгает между запросами.
 */
export function splitCart(rows: CartRow[]): {
  groups: CartGroup[];
  unavailable: CartRow[];
} {
  const groups = new Map<string, CartGroup>();
  const unavailable: CartRow[] = [];

  for (const row of rows) {
    if (!row.available) {
      unavailable.push(row);
      continue;
    }
    const key = groupKey(row);
    const group = groups.get(key) ?? {
      shopId: row.shopId,
      currency: row.currency,
      rows: [],
      subtotalMinor: 0,
    };
    group.rows.push(row);
    group.subtotalMinor += lineTotal(row);
    groups.set(key, group);
  }

  return { groups: [...groups.values()], unavailable };
}

/**
 * Сумма строки. У «договорной» и «даром» цены нет — такая позиция считается
 * нулём, а не выкидывается: продавец должен увидеть её в заявке и назвать
 * цену в переписке.
 */
export function lineTotal(row: Pick<CartRow, 'priceMinor' | 'quantity'>): number {
  if (row.priceMinor === null) return 0;
  return row.priceMinor * row.quantity;
}
