/**
 * История уведомлений (VED-404).
 *
 * Заказчик: «В истории должны храниться прочитанные уведомления согласно
 * хронологии контакта с ними. Контакт означает открывать и всё остальное».
 *
 * Лента (VED-153) упорядочена по дате новости: что пришло позже, то выше. Для
 * «вернуться к тому, что я только что смотрел» такой порядок бесполезен —
 * уведомление недельной давности, открытое минуту назад, лежит в самом низу.
 * История — те же прочитанные строки, но в порядке последнего контакта
 * (`NotificationItem.contactAt`), как история переходов по порталу (VED-392)
 * хранит места в порядке захода, а не в порядке их появления.
 *
 * Контакт — любое действие человека с уведомлением:
 *
 * - открыл (переход по ссылке карточки — и в ленте, и в самой истории);
 * - отметил прочитанным или вернул в непрочитанные кнопкой на карточке;
 * - «Отметить все прочитанными» — контакт со всеми погашенными разом;
 * - закрыл задачу «Работы», о которой уведомление (VED-406): человек сам
 *   принял работу, и уведомления о ней им разобраны, даже если он их не
 *   открывал.
 *
 * Подъём строки ветки (VED-320) контактом не считается: это новость пришла к
 * человеку, а не он к ней. Поэтому `threadLiftData` колонку не трогает.
 *
 * Модуль чистый: курсор, условия выборки и данные записи проверяются тестом
 * без Nest и без базы, как и соседний `inbox-page.ts`.
 */

/** Порция истории — как у ленты: двадцать карточек со стеклом на экран. */
export const HISTORY_PAGE_SIZE = 20;

/** Потолок порции: больше сервер не отдаёт, сколько бы ни попросили. */
export const MAX_HISTORY_PAGE_SIZE = 100;

/** Докуда дочитали историю: последняя отданная строка. */
export interface HistoryCursor {
  readonly contactAt: Date;
  readonly id: string;
}

/** `invalid` — не то же, что `none`: начать сначала на битом курсоре значило
 *  бы зациклить «Показать ещё». */
export type HistoryCursorParse =
  | { kind: 'none' }
  | { kind: 'cursor'; cursor: HistoryCursor }
  | { kind: 'invalid' };

/** Метка вида курсора: курсор ленты сюда не подойдёт, и наоборот. */
const CURSOR_KIND = 'history';
const CURSOR_SEPARATOR = '|';

export function encodeHistoryCursor(cursor: HistoryCursor): string {
  const plain = [CURSOR_KIND, cursor.contactAt.toISOString(), cursor.id].join(
    CURSOR_SEPARATOR,
  );
  return Buffer.from(plain, 'utf8').toString('base64url');
}

export function parseHistoryCursor(raw: unknown): HistoryCursorParse {
  if (raw === undefined || raw === null || raw === '') return { kind: 'none' };
  if (typeof raw !== 'string') return { kind: 'invalid' };
  const parts = Buffer.from(raw, 'base64url')
    .toString('utf8')
    .split(CURSOR_SEPARATOR);
  if (parts.length !== 3) return { kind: 'invalid' };
  const [kind, iso, id] = parts;
  if (kind !== CURSOR_KIND || id.length === 0) return { kind: 'invalid' };
  const contactAt = new Date(iso);
  if (Number.isNaN(contactAt.getTime())) return { kind: 'invalid' };
  return { kind: 'cursor', cursor: { contactAt, id } };
}

/** Запрошенный размер порции в допустимых пределах. */
export function clampHistoryLimit(raw: unknown): number {
  const value =
    typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return HISTORY_PAGE_SIZE;
  return Math.min(Math.trunc(value), MAX_HISTORY_PAGE_SIZE);
}

/**
 * Условие выборки истории: только прочитанное — непрочитанное живёт в ленте
 * под «Новое», и дважды его показывать незачем. Строка, возвращённая в
 * непрочитанные, из истории уходит и вернётся, когда её снова прочтут.
 *
 * `contactAt: { not: null }` — не фильтр, а страховка keyset'а: сравнение с
 * `NULL` в Postgres ничего не находит, и такая строка потерялась бы между
 * порциями. Прочитанных без контакта нет — их заполнила миграция, а каждая
 * запись `readAt` пишет и `contactAt` (см. данные записи ниже).
 */
export function buildHistoryWhere(
  userId: string,
  cursor: HistoryCursor | null,
): object {
  return {
    userId,
    readAt: { not: null },
    contactAt: { not: null },
    ...(cursor
      ? {
          OR: [
            { contactAt: { lt: cursor.contactAt } },
            { contactAt: cursor.contactAt, id: { lt: cursor.id } },
          ],
        }
      : {}),
  };
}

/** Порядок — тот же, что у индекса `[userId, contactAt]`, плюс тай-брейк:
 *  «Отметить все прочитанными» ставит одну и ту же дату многим строкам. */
export const HISTORY_ORDER_BY = [
  { contactAt: 'desc' as const },
  { id: 'desc' as const },
];

export interface HistoryPageRow {
  id: string;
  contactAt: Date | null;
}

/**
 * Порция из `limit + 1` строк: лишняя отбрасывается, а её наличие и значит
 * «есть продолжение». Курсор — с последней отданной строки.
 */
export function sliceHistoryPage<T extends HistoryPageRow>(
  rows: readonly T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor:
      rows.length > limit && last?.contactAt
        ? encodeHistoryCursor({ contactAt: last.contactAt, id: last.id })
        : null,
  };
}

/**
 * Что записать, когда человек прочёл непрочитанное: прочтение — тоже контакт,
 * и обе даты одни. Без `contactAt` строка ушла бы из ленты «Новое», но в
 * историю не попала бы — выпала бы из обоих списков.
 */
export function readContactData(now: Date): { readAt: Date; contactAt: Date } {
  return { readAt: now, contactAt: now };
}

/**
 * Контакт с уже прочитанным: открыл из ленты или из истории. Дата прочтения
 * остаётся прежней — это ответ на вопрос «когда я это впервые прочёл», а
 * поднимается строка в истории.
 */
export function contactOnlyData(now: Date): { contactAt: Date } {
  return { contactAt: now };
}

/**
 * Кнопка отметки на карточке (VED-143), в обе стороны. Нажатие — контакт при
 * любом исходе. `readAt` у уже прочитанного не переставляется, как и было:
 * повторное «прочитано» не меняет дату первого прочтения.
 */
export function readStateData(
  currentReadAt: Date | null,
  read: boolean,
  now: Date,
): { readAt: Date | null; contactAt: Date } {
  return { readAt: read ? (currentReadAt ?? now) : null, contactAt: now };
}

/**
 * Кого закрытие задачи избавляет от уведомлений о ней (VED-406): того, кто
 * закрыл, и того, от чьего имени действовал ИИ-агент. Пустые и повторы
 * отбрасываются — ходить в базу с пустым `in` незачем.
 */
export function closedTaskReaders(
  ids: readonly (string | null | undefined)[],
): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}
