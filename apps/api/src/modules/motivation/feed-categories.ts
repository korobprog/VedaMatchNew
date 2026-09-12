/**
 * Какие папки показывает лента (VED-22).
 *
 * Раньше папка была одна: `?category=vedy`. Просили смотреть несколько сразу,
 * поэтому тот же параметр принимает список через запятую — старые ссылки
 * остаются рабочими, а новая просто длиннее: `?category=vedy,praktika`.
 *
 * Разбор отдельным модулем, потому что от него зависит не только фильтр: по
 * пустому списку лента считается личной (подбор по направлениям человека), а
 * с выбранными папками — нет. Ошибиться тут значит либо показать чужое, либо
 * молча подменить выбор человека подбором.
 */

/** Сколько папок принимаем разом: список в адресе не должен расти без края. */
export const MAX_FEED_CATEGORIES = 12;

/**
 * Список слагов из параметра. Пустые куски, пробелы и повторы выбрасываем:
 * «vedy,,vedy» — это одна папка, а не три.
 */
export function feedCategories(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return [...new Set(parts)].slice(0, MAX_FEED_CATEGORIES);
}

/**
 * Условие отбора по папкам для Prisma; `null` — папки не выбраны, отбора нет.
 * Одна папка сравнивается напрямую: `in` с одним значением читается хуже и в
 * плане запроса, и глазами.
 */
export function feedCategoryWhere(
  categories: readonly string[],
): { category: string | { in: string[] } } | null {
  if (categories.length === 0) return null;
  if (categories.length === 1) return { category: categories[0] };
  return { category: { in: [...categories] } };
}
