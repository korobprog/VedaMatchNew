import type { LibraryCategoryDto, LibraryLocale } from "@vedamatch/shared";
import { pickLocalized } from "./i18n";

/**
 * Порядок плиток подрубрик на странице рубрики (VED-573): «Свой порядок» —
 * тот, что админ выставил перетаскиванием, «По алфавиту» — по имени.
 * Выбор живёт в адресе (`?order=alpha`): переживает «Назад» и открывается
 * по ссылке так же, как его оставили.
 */
export const CATEGORY_ORDER_PARAM = "order";
export const CATEGORY_ORDER_ALPHA = "alpha";

export function isAlphabeticalOrder(
  value: string | string[] | null | undefined,
): boolean {
  return value === CATEGORY_ORDER_ALPHA;
}

/**
 * Адрес страницы с выбранным порядком. «Свой порядок» — без параметра:
 * это вид по умолчанию, и лишний хвост в адресе ему ни к чему.
 */
export function categoryOrderHref(
  pathname: string,
  params: URLSearchParams,
  alphabetical: boolean,
): string {
  const next = new URLSearchParams(params.toString());
  if (alphabetical) next.set(CATEGORY_ORDER_PARAM, CATEGORY_ORDER_ALPHA);
  else next.delete(CATEGORY_ORDER_PARAM);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * Подрубрики в выбранном порядке. «Свой порядок» возвращает массив как есть:
 * API уже отдаёт его по `position`. Алфавит — по имени на языке интерфейса,
 * без учёта регистра, числа по значению («2» раньше «10»).
 */
export function sortCategoriesForView<
  T extends Pick<LibraryCategoryDto, "titleRu" | "titleEn">,
>(categories: T[], locale: LibraryLocale, alphabetical: boolean): T[] {
  if (!alphabetical) return categories;
  const collator = new Intl.Collator(locale, {
    sensitivity: "base",
    numeric: true,
  });
  const name = (category: T) =>
    pickLocalized(locale, { ru: category.titleRu, en: category.titleEn });
  return [...categories].sort((a, b) => collator.compare(name(a), name(b)));
}
