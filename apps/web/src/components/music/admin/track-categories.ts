import type { MusicCategoryDto } from "@vedamatch/shared";

/**
 * Стиль записи из уже стоящих тегов (VED-165-2).
 *
 * Раньше запись несла два тега одновременно — корневую категорию и стиль
 * (VED-165) — и здесь жил разбор обоих (`splitTrackCategories`). Корневая
 * переехала на исполнителя (по просьбе тестировщика — «скопом», без правки
 * каждой записи), и у формы правки записи остаётся один выбор: стиль.
 *
 * Если на записи почему-то оказалось несколько стилевых тегов (например,
 * заведено раньше через API напрямую), берётся первый — форма всё равно
 * заменит набор целиком при сохранении.
 */
export function styleCategoryId(
  categoryIds: string[],
  categories: MusicCategoryDto[],
): string {
  const byId = new Map(categories.map((category) => [category.id, category]));
  for (const id of categoryIds) {
    if (byId.get(id)?.kind === "style") return id;
  }
  return "";
}
