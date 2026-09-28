import {
  LINEAGE_ALL,
  isBlogPostCategory,
  isLineageId,
  type BlogPostCategory,
  type LineageId,
} from "@vedamatch/shared";

/**
 * Категория и линия в форме поста (VED-590): «пост невозможно
 * опубликовать, не назначив линию и категорию». Арифметика отдельно от
 * разметки — её проверяют тесты без DOM.
 *
 * Значения — строки полей формы: `""` — не выбрано, у линии `"all"` —
 * явный выбор «Для всех». Пустота «для всех» не считается: заказчик хочет,
 * чтобы и это решение автор принял сам.
 */

/** Линия поля формы → поле запроса; `null` — ещё не выбрана. */
export function blogLineageRequestValue(
  value: string,
): LineageId | typeof LINEAGE_ALL | null {
  if (value === LINEAGE_ALL) return LINEAGE_ALL;
  return isLineageId(value) ? value : null;
}

/** Категория поля формы → поле запроса; `null` — ещё не выбрана. */
export function blogCategoryRequestValue(
  value: string,
): BlogPostCategory | null {
  return isBlogPostCategory(value) ? value : null;
}

/**
 * Почему кнопка «Опубликовать» («Сохранить») неактивна; `null` — всё
 * выбрано. Текст стоит рядом с кнопкой: неактивная кнопка без объяснения
 * выглядит сломанной.
 */
export function blogPostMarksHint(
  category: string,
  lineage: string,
  action: "publish" | "save" = "publish",
): string | null {
  const noCategory = blogCategoryRequestValue(category) === null;
  const noLineage = blogLineageRequestValue(lineage) === null;
  if (!noCategory && !noLineage) return null;
  const verb = action === "publish" ? "опубликовать" : "сохранить";
  if (noCategory && noLineage) {
    return `Чтобы ${verb} пост, выберите категорию и линию (или «Для всех»).`;
  }
  if (noCategory) return `Чтобы ${verb} пост, выберите категорию.`;
  return `Чтобы ${verb} пост, выберите линию (или «Для всех»).`;
}
