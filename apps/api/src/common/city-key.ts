/**
 * Нормализованный ключ города для фильтров по равенству.
 *
 * Хранится в колонке `cityKey` рядом с «человеческим» `city` (Notice,
 * MarketListing, MarketShop, Community): обычный btree по `cityKey`
 * работает с `=`, тогда как `{ equals, mode: 'insensitive' }` в Prisma
 * превращается в ILIKE и индексы обходит.
 *
 * Правило одно и то же на записи и на чтении: обрезать пробелы и привести
 * к нижнему регистру. Пустая строка и отсутствие города — null.
 */
export function normalizeCityKey(
  city: string | null | undefined,
): string | null {
  if (city == null) return null;
  const key = city.trim().toLowerCase();
  return key.length > 0 ? key : null;
}
