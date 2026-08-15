/** Ключи фильтров ленты Рынка, которые страница пробрасывает из адреса в API.
 *  Всё остальное в searchParams (например `page` от внешних ссылок) отбрасываем,
 *  чтобы не гонять мусор в запрос. */
const LISTING_FILTER_KEYS = [
  "q",
  "kind",
  "sectionSlug",
  "categorySlug",
  "shopSlug",
  "shelfSlug",
  "priceMin",
  "priceMax",
  "currency",
  "condition",
  "serviceFormat",
  "city",
  "country",
  "delivery",
  "available",
  "favorited",
  "sort",
  "cursor",
] as const;

export type MarketFilterKey = (typeof LISTING_FILTER_KEYS)[number];

/**
 * Собирает query-строку для API Рынка.
 *
 * Пустые значения выбрасываются: `?city=` означает «фильтр сброшен», и гнать
 * его на сервер незачем. Значение-массив (Next отдаёт его при повторяющемся
 * параметре) сводим к первому — в Рынке нет фильтров с множественным выбором.
 */
export function buildMarketQuery(
  params?: Record<string, string | string[] | undefined>,
  overrides?: Partial<Record<MarketFilterKey, string | number | boolean | undefined>>,
): string {
  const query = new URLSearchParams();

  for (const key of LISTING_FILTER_KEYS) {
    const raw = params?.[key];
    const first = Array.isArray(raw) ? raw[0] : raw;
    if (first && first.trim()) query.set(key, first.trim());
  }

  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (value === undefined || value === null || value === "") {
      query.delete(key);
      continue;
    }
    query.set(key, String(value));
  }

  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

/**
 * Адрес страницы каталога с изменённым фильтром. Курсор всегда сбрасывается:
 * он посчитан для прежней выдачи и после смены фильтра указывает не туда.
 */
export function withFilter(
  params: Record<string, string | string[] | undefined>,
  patch: Partial<Record<MarketFilterKey, string | undefined>>,
): string {
  return buildMarketQuery(params, { ...patch, cursor: undefined });
}
