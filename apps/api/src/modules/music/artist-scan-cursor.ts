/**
 * Курсор разбора коллекции «Исполнители по тегам».
 *
 * Прогон берёт ограниченную пачку записей без исполнителя. Без курсора
 * каждый следующий прогон брал бы те же первые записи: у кого имени нет ни в
 * теге, ни в названии, и чьё имя редакция сняла с применения, остаются без
 * исполнителя — и загораживали бы собой всё, что дальше.
 *
 * Порядок — `createdAt`, затем `id`: время создания повторяется у записей
 * одной партии, `id` делает порядок строгим.
 */

export interface ScanCursor {
  createdAt: Date;
  id: string;
}

export function encodeScanCursor(cursor: ScanCursor): string {
  return `${cursor.createdAt.toISOString()}|${cursor.id}`;
}

/** Битый или чужой курсор — начать сначала, а не упасть. */
export function decodeScanCursor(raw: unknown): ScanCursor | null {
  if (typeof raw !== 'string') return null;
  const separator = raw.indexOf('|');
  if (separator <= 0) return null;
  const createdAt = new Date(raw.slice(0, separator));
  const id = raw.slice(separator + 1);
  if (Number.isNaN(createdAt.getTime()) || !/^[0-9a-f-]{8,64}$/i.test(id))
    return null;
  return { createdAt, id };
}

/** Условие «записи после курсора» для Prisma. */
export function afterCursorWhere(cursor: ScanCursor | null) {
  if (!cursor) return {};
  return {
    OR: [
      { createdAt: { gt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { gt: cursor.id } },
    ],
  };
}
