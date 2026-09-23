/**
 * Свёрнутые колонки доски.
 *
 * На телефоне колонки стоят столбиком, и «Разное» с полусотней карточек
 * отодвигает всё, что после него, за три экрана прокрутки. Свёрнутая колонка
 * оставляет заголовок и счётчик: видно, что там четырнадцать задач, и видно
 * следующую колонку.
 *
 * Хранится на устройстве, как раскладка панели горячих кнопок: это привычка
 * руки, а не данные человека. Ключ — на доску: колонки у досок свои, и
 * свёрнутое здесь ничего не говорит о соседней среде.
 */

export const COLLAPSED_COLUMNS_STORAGE_PREFIX = "vedamatch:work-collapsed:";

export function collapsedColumnsKey(boardId: string): string {
  return `${COLLAPSED_COLUMNS_STORAGE_PREFIX}${boardId}`;
}

/** Мусор в хранилище — это «ничего не свёрнуто», а не сломанный экран. */
export function parseCollapsedColumns(
  raw: string | null | undefined,
): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
}

export function serializeCollapsedColumns(ids: string[]): string {
  return JSON.stringify(ids);
}

export function toggleCollapsedColumn(
  ids: string[],
  columnId: string,
): string[] {
  return ids.includes(columnId)
    ? ids.filter((id) => id !== columnId)
    : [...ids, columnId];
}

/** Карточка приехала в свёрнутую колонку — колонка разворачивается, иначе
 *  перенос выглядит как пропажа. */
export function expandCollapsedColumn(
  ids: string[],
  columnId: string,
): string[] {
  return ids.includes(columnId) ? ids.filter((id) => id !== columnId) : ids;
}

export function readCollapsedColumns(boardId: string): string[] {
  try {
    return parseCollapsedColumns(
      window.localStorage.getItem(collapsedColumnsKey(boardId)),
    );
  } catch {
    return [];
  }
}

export function writeCollapsedColumns(boardId: string, ids: string[]): void {
  try {
    window.localStorage.setItem(
      collapsedColumnsKey(boardId),
      serializeCollapsedColumns(ids),
    );
  } catch {
    // Приватный режим: свёрнутое живёт до конца сессии.
  }
}

/**
 * Все ли колонки доски свёрнуты. Пустая доска не считается свёрнутой:
 * сворачивать там нечего, и кнопка не должна предлагать развернуть пустоту.
 */
export function everyColumnCollapsed(
  ids: readonly string[],
  columnIds: readonly string[],
): boolean {
  return columnIds.length > 0 && columnIds.every((id) => ids.includes(id));
}

/**
 * Одна кнопка на всю доску: свернуть всё или, если уже свёрнуто, развернуть.
 *
 * Складывать колонки по одной — то же самое листание, ради которого их и
 * складывают: на доске их у нас двенадцать. Кнопка меняет смысл по состоянию,
 * а не стоит парой рядом: две кнопки, одна из которых всегда бесполезна,
 * занимают ту же строку, что и сами колонки.
 *
 * Свернуть — значит записать ровно нынешние колонки: заодно из памяти
 * выпадают те, которых на доске уже нет.
 */
export function toggleAllColumns(
  ids: readonly string[],
  columnIds: readonly string[],
): string[] {
  return everyColumnCollapsed(ids, columnIds) ? [] : [...columnIds];
}
