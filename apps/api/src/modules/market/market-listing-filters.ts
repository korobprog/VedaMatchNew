import type { MarketListingFilters } from '@vedamatch/shared';

/**
 * Query приходит строками, а фильтры типизированы. Разбор держим отдельно,
 * чтобы сервис получал осмысленные значения, а не `'true'` и `'12,5'`.
 *
 * Значения энумов сюда попадают без проверки: сервис кладёт их прямо в
 * `where`, и Prisma отвергает несуществующий член энума сама. Проверять их
 * ещё и здесь — дублировать список в третьем месте.
 */
export function parseListingFilters(
  query: Record<string, string | undefined>,
): MarketListingFilters {
  return {
    q: trimOrUndefined(query.q),
    kind: query.kind as MarketListingFilters['kind'],
    sectionSlug: trimOrUndefined(query.sectionSlug),
    categorySlug: trimOrUndefined(query.categorySlug),
    shopSlug: trimOrUndefined(query.shopSlug),
    shelfSlug: trimOrUndefined(query.shelfSlug),
    priceMin: parseNumber(query.priceMin),
    priceMax: parseNumber(query.priceMax),
    currency: query.currency as MarketListingFilters['currency'],
    condition: query.condition as MarketListingFilters['condition'],
    serviceFormat: query.serviceFormat as MarketListingFilters['serviceFormat'],
    city: trimOrUndefined(query.city),
    country: trimOrUndefined(query.country),
    delivery: query.delivery as MarketListingFilters['delivery'],
    // Флаги включаются только явным 'true': пустая строка в адресе — это
    // «фильтр сброшен», а не «включён».
    available: query.available === 'true',
    favorited: query.favorited === 'true',
    sort: query.sort as MarketListingFilters['sort'],
    cursor: trimOrUndefined(query.cursor),
  };
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  // Запятая как десятичный разделитель приезжает из русской раскладки.
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function trimOrUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
