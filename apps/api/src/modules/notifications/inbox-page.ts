/**
 * Постраничная лента уведомлений (VED-267).
 *
 * Задача: отдавать ленту порциями, не сломав порядок VED-153 — непрочитанное
 * впереди, внутри группы свежее сверху (`inbox-order.ts`).
 *
 * Как одно уживается с другим. «Непрочитанное впереди» — не сортировка по
 * колонке, а склейка двух потоков: сначала весь поток непрочитанного, потом
 * весь поток прочитанного. Каждый поток по отдельности упорядочен ровно так,
 * как лежит индекс `[userId, createdAt]`, поэтому страница берётся обычным
 * keyset'ом внутри потока, а на границе просто происходит переход к
 * следующему. Отсюда и курсор: он хранит не только «докуда дочитали», но и
 * «в каком потоке» — `unread` или `read`.
 *
 * Почему не `skip`/`offset`: между страницами человек открывает уведомления,
 * и прочитанное переезжает из первого потока во второй. Смещение после этого
 * показывает не ту строку — при чтении сверху вниз ровно то, что человек
 * только что открыл, и пропускает соседнее. Keyset привязан к самой строке и
 * такого не умеет.
 *
 * Чего keyset тоже не умеет: если уведомление стало прочитанным уже после
 * того, как человек прошёл мимо него в первом потоке, оно встретится ему
 * второй раз — теперь в потоке прочитанного. Дубль по `id` убирает клиент
 * (`mergeInboxPages` на вебе): дешевле, чем тащить на сервер список уже
 * показанного.
 *
 * Тай-брейк по `id` обязателен: `createMany` в одной транзакции проставляет
 * всем строкам один и тот же `now()`, и у рассылки на две сотни человек
 * `createdAt` совпадает до микросекунды. Сравнение только по дате в такой
 * пачке зациклило бы «показать ещё» на одном месте.
 */

/** Сколько уведомлений в одной порции. Первый экран телефона — это 4–6
 *  карточек; двадцати хватает, чтобы прокрутка не упиралась в кнопку. */
export const INBOX_PAGE_SIZE = 20;

/** Потолок на случай, если размер попросят запросом. */
export const MAX_INBOX_PAGE_SIZE = 100;

/** Поток ленты: сначала весь `unread`, следом весь `read`. */
export type InboxSection = 'unread' | 'read';

/** Докуда дочитали: поток и последняя отданная строка в нём. */
export interface InboxCursor {
  readonly section: InboxSection;
  readonly createdAt: Date;
  readonly id: string;
}

/** Итог разбора курсора из запроса. `invalid` — не то же, что `none`:
 *  молча начать с начала значило бы зациклить «показать ещё». */
export type InboxCursorParse =
  | { kind: 'none' }
  | { kind: 'cursor'; cursor: InboxCursor }
  | { kind: 'invalid' };

/** Разделитель полей курсора. Вертикальная черта не встречается ни в uuid,
 *  ни в ISO-дате, ни в названии потока, поэтому разбор однозначен. */
const CURSOR_SEPARATOR = '|';

/** Курсор строкой: клиент возвращает её как есть и внутрь не смотрит. */
export function encodeInboxCursor(cursor: InboxCursor): string {
  const plain = [
    cursor.section,
    cursor.createdAt.toISOString(),
    cursor.id,
  ].join(CURSOR_SEPARATOR);
  return Buffer.from(plain, 'utf8').toString('base64url');
}

/** Разбор курсора. Всё непонятное — `invalid`, включая чужую подделку:
 *  строки из курсора никуда, кроме сравнения дат и `id`, не попадают. */
export function parseInboxCursor(raw: unknown): InboxCursorParse {
  if (raw === undefined || raw === null || raw === '') return { kind: 'none' };
  if (typeof raw !== 'string') return { kind: 'invalid' };

  let plain: string;
  try {
    plain = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return { kind: 'invalid' };
  }
  const parts = plain.split(CURSOR_SEPARATOR);
  if (parts.length !== 3) return { kind: 'invalid' };
  const [section, iso, id] = parts;
  if (section !== 'unread' && section !== 'read') return { kind: 'invalid' };
  if (id.length === 0) return { kind: 'invalid' };
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime())) return { kind: 'invalid' };
  return { kind: 'cursor', cursor: { section, createdAt, id } };
}

/** Сколько строк просить у базы, чтобы попутно узнать, есть ли продолжение. */
export function inboxFetchSize(limit: number): number {
  return limit + 1;
}

/** Запрошенный размер порции в допустимых пределах. */
export function clampInboxLimit(raw: unknown): number {
  const value =
    typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return INBOX_PAGE_SIZE;
  return Math.min(Math.trunc(value), MAX_INBOX_PAGE_SIZE);
}

/**
 * Какие потоки читать при таком курсоре. Курсор в прочитанном означает, что
 * непрочитанное уже кончилось: возвращаться в него не за чем.
 */
export function inboxSections(cursor: InboxCursor | null): InboxSection[] {
  return cursor?.section === 'read' ? ['read'] : ['unread', 'read'];
}

/** Условие Prisma для одной порции. Типы описаны здесь, а не взяты из
 *  `@prisma/client`: модуль чистый и проверяется без генерации клиента. */
export interface InboxWhere {
  userId: string;
  readAt: null | { not: null };
  AND?: object[];
}

/** Keyset: строго дальше той строки, на которой остановились. */
export function inboxKeysetClause(cursor: InboxCursor): object {
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ],
  };
}

/**
 * Условие выборки одного потока.
 *
 * Курсор применяется только к своему потоку: перейдя из непрочитанного в
 * прочитанное, читаем прочитанное с самого начала — человек его ещё не видел.
 */
export function buildInboxWhere(params: {
  userId: string;
  section: InboxSection;
  cursor: InboxCursor | null;
  searchClauses?: readonly object[];
}): InboxWhere {
  const { userId, section, cursor, searchClauses = [] } = params;
  const and: object[] = [];
  if (cursor && cursor.section === section) and.push(inboxKeysetClause(cursor));
  and.push(...searchClauses);
  return {
    userId,
    readAt: section === 'unread' ? null : { not: null },
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

/** Порядок выборки внутри потока — тот же, что у индекса, плюс тай-брейк. */
export const INBOX_ORDER_BY = [
  { createdAt: 'desc' as const },
  { id: 'desc' as const },
];

/** Строка, из которой собирается курсор следующей страницы. */
export interface InboxPageRow {
  id: string;
  createdAt: Date;
  readAt: Date | null;
}

export interface InboxPage<T extends InboxPageRow> {
  items: T[];
  /** `null` — дальше ничего нет, кнопку «показать ещё» показывать не за чем. */
  nextCursor: string | null;
}

/**
 * Порция из `limit + 1` прочитанных строк: лишняя отбрасывается, а её наличие
 * и означает «есть продолжение». Курсор берётся с последней отданной строки,
 * и поток в нём — её собственный, а не тот, с которого страница началась:
 * страница могла перевалить через границу.
 */
export function sliceInboxPage<T extends InboxPageRow>(
  rows: readonly T[],
  limit: number,
): InboxPage<T> {
  const items = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      hasMore && last
        ? encodeInboxCursor({
            section: last.readAt === null ? 'unread' : 'read',
            createdAt: last.createdAt,
            id: last.id,
          })
        : null,
  };
}
