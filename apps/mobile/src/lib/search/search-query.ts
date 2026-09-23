/**
 * Запрос поиска по порталу в приложении (VED-337): очистка и пороги.
 *
 * Правила очистки — те же, что у сервера (`normalizePortalQuery`,
 * `apps/api/src/modules/assistant/portal-search.ts`): пробелы схлопнуты,
 * длина обрезана до 120. Совпадать им важно: иначе приложение считало бы
 * «коротким» то, что сервер ищет, или наоборот гоняло бы запрос, на который
 * сервер ответит «слишком короткий».
 */

/** Меньше двух знаков сервер не ищет — и мы не спрашиваем. */
export const SEARCH_MIN_QUERY = 2;
export const SEARCH_MAX_QUERY = 120;

/**
 * Переписку сервер ищет с трёх знаков (`chat-conversations.service.ts`,
 * `search`): один-два символа находят половину переписки.
 */
export const CHAT_SEARCH_MIN_QUERY = 3;

/**
 * Пауза после последней буквы. Один запрос будит семь сервисов портала и
 * три справочника, а у ручки портала лимит 40 в минуту — на каждую букву
 * его хватило бы на полминуты набора.
 */
export const SEARCH_DEBOUNCE_MS = 400;

/** Запрос после очистки; `null` — искать нечего. */
export function normalizeSearchQuery(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const query = raw.replace(/\s+/g, ' ').trim().slice(0, SEARCH_MAX_QUERY).trim();
  return query.length >= SEARCH_MIN_QUERY ? query : null;
}

/** Искать ли в переписке — у неё порог выше. */
export function searchesChats(query: string): boolean {
  return query.length >= CHAT_SEARCH_MIN_QUERY;
}
