import { createHash } from 'node:crypto';
import type {
  MarketListingFilters,
  MarketSubscriptionKind,
} from '@vedamatch/shared';

/** Поля фильтра, влияющие на выдачу. `cursor` сюда не входит: он про
 *  страницу, а не про запрос, и от него ключ подписки зависеть не должен. */
const SIGNIFICANT_KEYS = [
  'q',
  'kind',
  'sectionSlug',
  'categorySlug',
  'shopSlug',
  'shelfSlug',
  'priceMin',
  'priceMax',
  'currency',
  'condition',
  'serviceFormat',
  'city',
  'country',
  'delivery',
  'available',
  'sort',
] as const;

/**
 * Стабильный ключ сохранённого поиска.
 *
 * Два одинаковых по смыслу фильтра должны давать один ключ независимо от
 * порядка полей в объекте — иначе `@@unique([userId, kind, targetKey])`
 * пропустит дубликаты, и человек подпишется на один и тот же запрос дважды.
 * Поэтому ключи сортируются, а пустые значения выбрасываются: `city: ''`
 * и отсутствие города — это один и тот же запрос.
 */
export function savedSearchKey(query: MarketListingFilters | undefined): string {
  const normalized: Record<string, string> = {};

  for (const key of SIGNIFICANT_KEYS) {
    const value = query?.[key];
    if (value === undefined || value === null || value === '') continue;
    if (typeof value === 'boolean') {
      // `false` — это «фильтр не включён», а не значение: иначе подписка
      // с available=false отличалась бы от подписки вообще без него.
      if (!value) continue;
      normalized[key] = 'true';
      continue;
    }
    normalized[key] = String(value).trim().toLowerCase();
  }

  const canonical = Object.keys(normalized)
    .sort()
    .map((key) => `${key}=${normalized[key]}`)
    .join('&');

  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

/**
 * Ключ подписки. Для магазина, раздела и категории это их id — цель
 * единственная. Для сохранённого поиска — хеш фильтров.
 */
export function subscriptionTargetKey(input: {
  kind: MarketSubscriptionKind;
  shopId?: string | null;
  sectionId?: string | null;
  categoryId?: string | null;
  query?: MarketListingFilters;
}): string | null {
  switch (input.kind) {
    case 'shop':
      return input.shopId ?? null;
    case 'section':
      return input.sectionId ?? null;
    case 'category':
      return input.categoryId ?? null;
    case 'saved_search':
      return savedSearchKey(input.query);
    default:
      return null;
  }
}
