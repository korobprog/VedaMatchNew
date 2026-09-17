import type { MusicCategoryDto } from "@vedamatch/shared";

/**
 * Разбор набора `categoryIds` записи на корневую и стилевую часть (VED-165).
 *
 * У записи может быть несколько категорий, но по замыслу фильтра — ровно
 * одна корневая («Традиционное»/«Современное») и ровно один стиль (киртан,
 * мантра…) одновременно. Форма правки показывает два раздельных выбора
 * вместо одного списка, и ей нужно знать, какой из уже стоящих на записи
 * тегов куда положить — отсюда и функция.
 *
 * Если на записи почему-то оказалось несколько тегов одного вида (например,
 * заведено раньше через API напрямую), берётся первый — форма всё равно
 * заменит набор целиком при сохранении.
 */
export interface SplitTrackCategories {
  rootId: string;
  styleId: string;
}

export function splitTrackCategories(
  categoryIds: string[],
  categories: MusicCategoryDto[],
): SplitTrackCategories {
  const byId = new Map(categories.map((category) => [category.id, category]));
  let rootId = "";
  let styleId = "";
  for (const id of categoryIds) {
    const category = byId.get(id);
    if (!category) continue;
    if (category.kind === "root" && !rootId) rootId = id;
    if (category.kind === "style" && !styleId) styleId = id;
  }
  return { rootId, styleId };
}

/**
 * Обратная операция: два выбора формы — обратно в `categoryIds` для
 * `updateMusicTrack`. Пустая строка — «не выбрано», в массив не попадает.
 */
export function mergeTrackCategories(
  rootId: string,
  styleId: string,
): string[] {
  return [rootId, styleId].filter((id) => id !== "");
}
