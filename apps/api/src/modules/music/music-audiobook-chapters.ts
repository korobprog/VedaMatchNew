/**
 * Состав аудиокниги (VED-297): что редакция прислала и можно ли это принять.
 *
 * Состав присылается целиком, по порядку (`PUT .../chapters`): добавить,
 * убрать и переставить главу — одно и то же действие, и порядок в базе
 * всегда плотный, с единицы. Чистым модулем, потому что здесь два
 * молчаливых отказа — мусор во входе и запись, которая уже глава другой
 * книги, — и оба надо проверять без базы.
 */

/**
 * Потолок глав. Больше не бывает и у многотомных начиток; нужен, чтобы
 * запрос не превращался в тысячу обращений к базе.
 */
export const MAX_AUDIOBOOK_CHAPTERS = 500;

/**
 * Список идентификаторов из тела запроса: строки, без пустых, без повторов
 * (первое вхождение решает место). `null` — пришло не то, что обещано.
 */
export function normalizeChapterIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') return null;
    const id = value.trim();
    if (id === '' || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export interface ChapterOwner {
  trackId: string;
  audiobookId: string;
  audiobookTitle: string;
}

/**
 * Первая запись из присланных, которая уже глава другой книги. Молча
 * переносить её нельзя: из той книги пропала бы глава, и никто бы этого не
 * заметил, — редакция получает отказ с названием книги.
 */
export function findChapterConflict(
  ids: string[],
  bookId: string,
  owners: ChapterOwner[],
): ChapterOwner | null {
  const byTrack = new Map(owners.map((row) => [row.trackId, row]));
  for (const id of ids) {
    const owner = byTrack.get(id);
    if (owner && owner.audiobookId !== bookId) return owner;
  }
  return null;
}
