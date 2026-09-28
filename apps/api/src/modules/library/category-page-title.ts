/**
 * Заголовок страницы рубрики отдельно от её названия (VED-394).
 *
 * Имя автора в Образовании — название его рубрики, и оно стоит в нескольких
 * местах: плитка у родителя, путь «Все рубрики › …», чип на карточках,
 * заголовок страницы. Заказчик попросил, чтобы правка в окне рубрики меняла
 * имя только там, а остальные места сохраняли прежнее. Поэтому у заголовка
 * своё необязательное поле; пустое — заголовок равен названию.
 */

export const CATEGORY_PAGE_TITLE_MAX_LENGTH = 120;

export type CategoryPageTitlePatch = {
  pageTitleRu?: string | null;
  pageTitleEn?: string | null;
};

export type CategoryPageTitleRejection =
  'page_title_too_long' | 'page_title_invalid';

/**
 * Из тела запроса — только переданные языки. Пустое, `null` или совпадающее
 * с названием на том же языке сохраняется как `null`: заголовок снова идёт
 * за названием, и следующее переименование на плитке его не обойдёт.
 */
export function pickCategoryPageTitle(
  body: Record<string, unknown>,
  titles: { titleRu: string | null; titleEn: string | null },
): CategoryPageTitlePatch | CategoryPageTitleRejection {
  const patch: CategoryPageTitlePatch = {};
  const fields = [
    ['pageTitleRu', titles.titleRu],
    ['pageTitleEn', titles.titleEn],
  ] as const;
  for (const [field, title] of fields) {
    const raw = body[field];
    if (raw === undefined) continue;
    if (raw !== null && typeof raw !== 'string') return 'page_title_invalid';
    const text = raw?.replace(/\s+/g, ' ').trim() || null;
    if (text && text.length > CATEGORY_PAGE_TITLE_MAX_LENGTH) {
      return 'page_title_too_long';
    }
    patch[field] = text && text !== title?.trim() ? text : null;
  }
  return patch;
}

export function isCategoryPageTitleRejection(
  value: CategoryPageTitlePatch | CategoryPageTitleRejection,
): value is CategoryPageTitleRejection {
  return typeof value === 'string';
}
