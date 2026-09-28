import {
  LINEAGE_ALL,
  isBlogPostCategory,
  isLineageId,
  type BlogPostCategory,
  type LineageId,
  type SpiritualStage,
} from "@vedamatch/shared";
import { toggleAudienceStage } from "@/lib/audience-stages";

/**
 * Категория, линия и ступень самоидентификации в форме поста (VED-590):
 * «пост невозможно опубликовать, не назначив линию и категорию», «обязательно
 * нужно определить ступень самоидентификации для поста». Арифметика отдельно
 * от разметки — её проверяют тесты без DOM.
 *
 * Значения — строки полей формы: `""` — не выбрано, у линии `"all"` —
 * явный выбор «Для всех». Пустота «для всех» не считается: заказчик хочет,
 * чтобы и это решение автор принял сам. Ступени — то же, только выбрать их
 * можно несколько (`BlogAudienceValue`).
 */

/**
 * Ступени в форме: `null` — не выбраны, `"all"` — явное «Для всех», иначе
 * отмеченные ступени в порядке пути (не пусто).
 */
export type BlogAudienceValue = SpiritualStage[] | typeof LINEAGE_ALL | null;

/**
 * Нажали «Для всех» или ступень. «Для всех» и ступени взаимоисключают друг
 * друга: отметить ступень — значит сузить круг, и «Для всех» снимается.
 * Сняли последнюю ступень — снова не выбрано, а не «для всех».
 */
export function toggleBlogAudience(
  current: BlogAudienceValue,
  choice: SpiritualStage | typeof LINEAGE_ALL,
): BlogAudienceValue {
  if (choice === LINEAGE_ALL)
    return current === LINEAGE_ALL ? null : LINEAGE_ALL;
  const next = toggleAudienceStage(
    Array.isArray(current) ? current : [],
    choice,
  );
  return next.length > 0 ? next : null;
}

/**
 * Ступени поста → поле формы правки. Пост без ступеней — «для всех» (так
 * его и показывает лента), поэтому в правке это уже выбранный вариант.
 */
export function blogAudienceFromPost(
  stages: readonly SpiritualStage[] | null | undefined,
): BlogAudienceValue {
  return stages?.length ? [...stages] : LINEAGE_ALL;
}

/** Ступени поля формы → поле запроса; `null` — ещё не выбраны. */
export function blogAudienceRequestValue(
  value: BlogAudienceValue,
): SpiritualStage[] | typeof LINEAGE_ALL | null {
  if (value === LINEAGE_ALL) return LINEAGE_ALL;
  return Array.isArray(value) && value.length > 0 ? value : null;
}

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
  marks: { category: string; lineage: string; audience: BlogAudienceValue },
  action: "publish" | "save" = "publish",
): string | null {
  const missing: string[] = [];
  if (blogCategoryRequestValue(marks.category) === null) {
    missing.push("категорию");
  }
  const noLineage = blogLineageRequestValue(marks.lineage) === null;
  if (noLineage) missing.push("линию");
  const noAudience = blogAudienceRequestValue(marks.audience) === null;
  if (noAudience) missing.push("ступень");
  if (missing.length === 0) return null;
  const verb = action === "publish" ? "опубликовать" : "сохранить";
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(", ")} и ${missing[missing.length - 1]}`;
  // «Для всех» есть и у линии, и у ступени — подсказываем, что это выбор.
  const orAll = noLineage || noAudience ? " (или «Для всех»)" : "";
  return `Чтобы ${verb} пост, выберите ${list}${orAll}.`;
}
