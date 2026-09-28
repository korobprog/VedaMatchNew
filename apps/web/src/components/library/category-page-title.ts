import type { LibraryCategoryDto, LibraryLocale } from "@vedamatch/shared";
import { pickLocalized } from "./i18n";

type Titled = Pick<
  LibraryCategoryDto,
  "titleRu" | "titleEn" | "pageTitleRu" | "pageTitleEn"
>;

/**
 * Заголовок страницы рубрики (VED-394): свой, если задан кнопкой
 * «Редактировать» в окне рубрики, иначе — название рубрики. Плитка, путь и
 * чипы на карточках берут только название, поэтому правка заголовка их не
 * трогает.
 *
 * Язык выбирается раньше, чем источник: свой заголовок на другом языке не
 * заменяет название на языке интерфейса.
 */
export function categoryPageTitle(
  locale: LibraryLocale,
  category: Titled,
): string {
  return pickLocalized(locale, {
    ru: category.pageTitleRu ?? category.titleRu,
    en: category.pageTitleEn ?? category.titleEn,
  });
}

/** Значения полей формы заголовка: свой заголовок, а без него — название. */
export function pageTitleFormValues(category: Titled): {
  ru: string;
  en: string;
} {
  return {
    ru: category.pageTitleRu ?? category.titleRu ?? "",
    en: category.pageTitleEn ?? category.titleEn ?? "",
  };
}
