import type { WorkArchiveItemDto, WorkArchiveView } from "@vedamatch/shared";

/**
 * Подписи архива доски (VED-61). Отдельно от компонента: какую дату
 * показывать и где сейчас карточка — решение, а не вёрстка, и ошибка в нём
 * видна тестом.
 */

const DATE = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Дата той вкладки, на которой смотрят: у выполненных — когда закрыли, у
 * убранных — когда убрали. Другая дата здесь сбивала бы с порядка списка.
 */
export function archiveDateLabel(
  item: Pick<WorkArchiveItemDto, "completedAt" | "archivedAt">,
  view: WorkArchiveView,
): string | null {
  const raw = view === "removed" ? item.archivedAt : item.completedAt;
  if (!raw) return null;
  const date = DATE.format(new Date(raw));
  return view === "removed" ? `убрана ${date}` : `выполнена ${date}`;
}

/**
 * Где карточка сейчас. Выполненная может ещё стоять на доске в колонке с
 * галочкой — это надо сказать, иначе архив выглядит как «задачу унесли».
 */
export function archivePlaceLabel(
  item: Pick<WorkArchiveItemDto, "columnName" | "archivedAt">,
): string {
  return item.archivedAt
    ? `убрана с доски, была в «${item.columnName}»`
    : `на доске, в «${item.columnName}»`;
}
