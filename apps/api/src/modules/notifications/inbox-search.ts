/**
 * Разбор поискового запроса по ленте уведомлений (VED-267).
 *
 * Поиск серверный, а не фильтр по уже загруженному: лента приходит страницами,
 * и фильтрация на клиенте искала бы только в первой из них — хуже, чем ничего.
 * Здесь живёт вся логика «что человек набрал», без Prisma и без Nest.
 */

/** Длиннее человек в строку поиска не набирает, а `contains` по такому — уже
 *  не поиск, а способ занять базу. */
const MAX_QUERY_LENGTH = 100;

/** Больше слов в запрос не берём: каждое — отдельный `ILIKE` по двум колонкам. */
const MAX_TERMS = 6;

/** Разобранный запрос: слова, каждое из которых обязано найтись. */
export interface InboxSearch {
  /** Исходная строка после обрезки — её возвращаем клиенту как есть. */
  readonly raw: string;
  /** Слова запроса, по одному условию на каждое. */
  readonly terms: readonly string[];
}

/**
 * Что набрал человек. `null` — запроса нет: пустая строка, пробелы или вовсе
 * не строка (в query-параметр прилетает что угодно). Тогда лента обычная.
 *
 * Слова разделяются любыми пробелами; регистр не трогаем — сравнение всё
 * равно пойдёт нечувствительным к нему, а показать запрос обратно человеку
 * лучше в том виде, в каком он его набрал.
 */
export function parseInboxSearch(raw: unknown): InboxSearch | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, MAX_QUERY_LENGTH);
  if (trimmed.length === 0) return null;
  const terms = trimmed.split(/\s+/).filter(Boolean).slice(0, MAX_TERMS);
  if (terms.length === 0) return null;
  return { raw: trimmed, terms };
}

/** Одно слово запроса: найдено в заголовке или в тексте. */
export interface InboxSearchClause {
  OR: [
    { title: { contains: string; mode: 'insensitive' } },
    { body: { contains: string; mode: 'insensitive' } },
  ];
}

/**
 * Условия Prisma для разобранного запроса — по одному на слово, и все они
 * складываются через `AND`.
 *
 * Все слова обязаны найтись, каждое — в заголовке или в тексте. Это не
 * придирка: «VED-160 комментарий» человек набирает, чтобы сузить выдачу, а не
 * чтобы получить вдобавок все комментарии портала. Разные слова при этом
 * могут найтись в разных полях — заголовок и текст уведомления человек
 * различает плохо и правильно делает.
 *
 * Подстановка безопасна: `contains` уходит в параметр запроса, а не в текст
 * SQL, поэтому символы `%` и `_` ищутся сами собой и экранировать их незачем.
 */
export function buildInboxSearchClauses(
  search: InboxSearch | null,
): InboxSearchClause[] {
  if (!search) return [];
  return search.terms.map((term) => ({
    OR: [
      { title: { contains: term, mode: 'insensitive' as const } },
      { body: { contains: term, mode: 'insensitive' as const } },
    ],
  }));
}
