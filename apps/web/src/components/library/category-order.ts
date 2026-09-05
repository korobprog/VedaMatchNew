import type { LibraryCategoryDto, LibraryLocale } from "@vedamatch/shared";
import { pickLocalized } from "./i18n";

/**
 * Порядок рубрик в полосе.
 *
 * Свой порядок — тот, что выставлен перетаскиванием в режиме «Упорядочить»:
 * он смысловой, и по умолчанию показывается именно он. Алфавит и дата — это
 * способ найти рубрику, когда их стало больше, чем помещается в голове, а не
 * замена смысловому порядку. Поэтому выбор живёт на устройстве и никому,
 * кроме самого читателя, дерево не переставляет.
 */
export type LibraryCategoryOrder = "own" | "alpha" | "new";

export const LIBRARY_CATEGORY_ORDERS: LibraryCategoryOrder[] = [
  "own",
  "alpha",
  "new",
];

export function isCategoryOrder(value: unknown): value is LibraryCategoryOrder {
  return (
    typeof value === "string" &&
    (LIBRARY_CATEGORY_ORDERS as string[]).includes(value)
  );
}

/**
 * Отсортированная копия — исходный массив приходит из серверного компонента и
 * переиспользуется соседями, менять его на месте нельзя.
 *
 * Алфавит считается по показанному названию, а не по русскому всегда: в
 * английском интерфейсе «Философия» подписана «Philosophy», и сортировка по
 * скрытому названию выглядела бы случайной. `localeCompare` — потому что «ё»
 * и «Ё» обязаны стоять рядом с «е», а не в конце по коду символа.
 */
export function sortCategories<T extends LibraryCategoryDto>(
  categories: readonly T[],
  order: LibraryCategoryOrder,
  locale: LibraryLocale,
): T[] {
  const list = [...categories];

  if (order === "alpha") {
    return list.sort((a, b) =>
      title(a, locale).localeCompare(title(b, locale), locale, {
        sensitivity: "base",
        numeric: true,
      }),
    );
  }

  if (order === "new") {
    // Одинаковая дата — не повод для случайного порядка: у рубрик, заведённых
    // одним сидом, `createdAt` совпадает до миллисекунды.
    return list.sort(
      (a, b) =>
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        a.position - b.position,
    );
  }

  return list.sort((a, b) => a.position - b.position);
}

function title(category: LibraryCategoryDto, locale: LibraryLocale): string {
  return pickLocalized(locale, {
    ru: category.titleRu,
    en: category.titleEn,
  });
}
