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
