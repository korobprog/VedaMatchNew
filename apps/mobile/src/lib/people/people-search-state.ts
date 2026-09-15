import type { ContactsCardDto, ContactsSearchFilters } from '@vedamatch/shared';

/**
 * Чистая логика поиска по справочнику «Люди»: тот же приём отложенного
 * запроса, что на сайте (`chat-discover-view.tsx:25-41`), только вынесенный в
 * тестируемую функцию, склейка страниц без дублей и текст пустой выдачи.
 */

/** Задержка перед поиском по вводу — как на сайте. */
export const PEOPLE_SEARCH_DEBOUNCE_MS = 350;

/** Размер страницы справочника. */
export const PEOPLE_SEARCH_PAGE_SIZE = 20;

export interface Debounced<Args extends unknown[]> {
  (...args: Args): void;
  /** Отменить отложенный вызов — нужно на размонтировании экрана. */
  cancel(): void;
}

/**
 * Откладывает вызов `fn` на `delayMs`: каждый новый вызов сбрасывает таймер
 * предыдущего, поэтому быстрый набор текста шлёт только один запрос.
 */
export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, delayMs: number): Debounced<Args> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = ((...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  }) as Debounced<Args>;
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return debounced;
}

/**
 * Поколение выдачи: увеличивается только у запросов, меняющих сам поиск
 * (первая загрузка, новый ввод, обновление). Подгрузка следующей страницы
 * («more») поколение не меняет, а лишь запоминает то, что было на момент
 * её отправки.
 *
 * Раньше на все режимы был один общий счётчик — из-за этого более поздняя
 * по времени, но менее приоритетная подгрузка страницы «отменяла» более
 * ранний, но более важный ответ поиска (раунд оценки 004, дефект 3): ответ
 * поиска считался устаревшим только потому, что подгрузка страницы успела
 * запуститься позже. Поколение меняется только новым поиском, поэтому
 * подгрузка старой страницы никогда не «отменяет» новый ввод, а сама
 * корректно отбрасывается, если поиск успел обновить поколение раньше её
 * ответа.
 */
export function nextSearchGeneration(currentGeneration: number): number {
  return currentGeneration + 1;
}

/** Ответ применим, только если поколение поиска не сменилось с момента отправки запроса. */
export function isCurrentSearchGeneration(requestGeneration: number, currentGeneration: number): boolean {
  return requestGeneration === currentGeneration;
}

/**
 * Подгружать следующую страницу можно только когда текст в поле уже совпал
 * с применённым запросом (иначе список докрутки относится не к тому, что
 * сейчас набрано) и нет ни другой подгрузки, ни ещё непройденных страниц.
 */
export function canLoadMore(state: {
  query: string;
  appliedQuery: string;
  hasMore: boolean;
  loadingMore: boolean;
}): boolean {
  return state.hasMore && !state.loadingMore && state.query.trim() === state.appliedQuery.trim();
}

/** Query-строка `GET /chat/people/search`: минимум параметров этой задачи. */
export function buildPeopleSearchQuery(filters: Pick<ContactsSearchFilters, 'q' | 'page' | 'pageSize'>): string {
  const params = new URLSearchParams();
  const q = filters.q?.trim();
  if (q) params.set('q', q);
  if (filters.page && filters.page > 1) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Следующая страница приклеивается снизу без дублей по `userId`. */
export function appendNextPage(
  current: readonly ContactsCardDto[],
  next: readonly ContactsCardDto[],
): ContactsCardDto[] {
  const known = new Set(current.map((item) => item.userId));
  return [...current, ...next.filter((item) => !known.has(item.userId))];
}

/** Текст пустой выдачи: разный для «ничего не нашлось» и «пока пусто». */
export function directoryEmptyMessage(query: string): string {
  return query.trim()
    ? 'Ничего не нашлось. Попробуйте другое имя или город.'
    : 'В справочнике пока никого нет.';
}
