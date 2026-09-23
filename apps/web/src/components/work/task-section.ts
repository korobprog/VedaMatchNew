import type { WorkColumnDto } from "@vedamatch/shared";

/**
 * Разделы и статусы доски (VED-430).
 *
 * Заказчик: «Нужно отделить разделы задач и разделы их статусов». На его доске
 * в одном ряду стояли и темы — «РАЗНОЕ.», «МУЗЫКА», «РАБОТА», — и состояния:
 * «Тестерование», «На доработку», «В работе», «Выполнено». В окне задачи всё
 * это было одним списком «Раздел», и задача, уехавшая в «Выполнено», больше
 * не говорила, о чём она.
 *
 * Колонка статуса — та, у которой сервер нашёл код состояния
 * (`WorkColumnDto.statusMark`): разбор названия один на портал, своего здесь
 * не заводим. Остальные колонки — разделы. Сама задача по-прежнему стоит в
 * одной колонке, а раздел помнит сервер (`WorkTaskCardDto.sectionId`).
 *
 * Чистые функции без DOM: ошибка в них выглядит как «задача уехала не туда»,
 * и ловить это тестом дешевле.
 */

type ColumnKind = Pick<WorkColumnDto, "id" | "statusMark">;

export function isStatusColumn(column: Pick<WorkColumnDto, "statusMark">) {
  return column.statusMark != null;
}

/** Колонки двумя группами, каждая в своём порядке доски. */
export function splitColumnsByKind<Column extends ColumnKind>(
  columns: readonly Column[],
): { sections: Column[]; statuses: Column[] } {
  return {
    sections: columns.filter((column) => !isStatusColumn(column)),
    statuses: columns.filter(isStatusColumn),
  };
}

/**
 * Порядок показа: сначала разделы, потом статусы. Внутри группы — как
 * выстроили руками. По нему же ходят стрелки переноса на карточке: «следующий
 * раздел» — следующий на экране, а не в базе.
 */
export function orderColumnsByKind<Column extends ColumnKind>(
  columns: readonly Column[],
): Column[] {
  const { sections, statuses } = splitColumnsByKind(columns);
  return [...sections, ...statuses];
}

/** Поля окна задачи, которые описывают её место на доске. */
export interface TaskPlace {
  /** Колонка, где задача стоит: раздел или статус. */
  columnId: string;
  /** Раздел задачи; `null` — неизвестен. */
  sectionId: string | null;
}

/** Выбранный статус: колонка статуса, где стоит задача, или `""` — без статуса. */
export function placeStatusId(
  place: TaskPlace,
  columns: readonly ColumnKind[],
): string {
  const column = columns.find((item) => item.id === place.columnId);
  return column && isStatusColumn(column) ? column.id : "";
}

/**
 * Выбрали раздел. Задача без статуса переезжает в этот раздел; задача в
 * статусе остаётся где была — у неё меняется только раздел.
 */
export function chooseSection(
  place: TaskPlace,
  sectionId: string,
  columns: readonly ColumnKind[],
): TaskPlace {
  return placeStatusId(place, columns)
    ? { ...place, sectionId }
    : { columnId: sectionId, sectionId };
}

/**
 * Выбрали статус. Колонка статуса — задача едет в неё, раздел запоминается.
 * «Без статуса» — задача возвращается в свой раздел; раздел неизвестен —
 * в первый раздел доски, иначе ей было бы некуда встать.
 */
export function chooseStatus(
  place: TaskPlace,
  statusId: string,
  columns: readonly ColumnKind[],
): TaskPlace {
  if (statusId) return { ...place, columnId: statusId };
  const home =
    place.sectionId ??
    columns.find((column) => !isStatusColumn(column))?.id ??
    null;
  if (!home) return place;
  return { columnId: home, sectionId: home };
}

/**
 * Группа колонки — разделы или статусы. Стрелки «раньше/позже» у заголовка
 * переставляют колонку внутри её группы: на экране группы стоят раздельно, и
 * шаг через границу ничего бы видимо не менял.
 */
export function columnGroupOf<Column extends ColumnKind>(
  columns: readonly Column[],
  columnId: string,
): Column[] {
  const { sections, statuses } = splitColumnsByKind(columns);
  return statuses.some((column) => column.id === columnId)
    ? statuses
    : sections;
}
