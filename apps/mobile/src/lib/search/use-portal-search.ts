import { useCallback, useEffect, useState } from 'react';
import { SearchCancelled, type SearchApi } from './search-api';
import { SEARCH_DEBOUNCE_MS, normalizeSearchQuery } from './search-query';
import { buildSearchView, type SearchView } from './search-results';

export interface PortalSearchState {
  /** Запрос, к которому относится `view`; `null` — искать нечего. */
  query: string | null;
  view: SearchView | null;
  /** Ждём ответа на текущий набор. Прежняя выдача при этом остаётся на экране. */
  loading: boolean;
}

const IDLE: PortalSearchState = { query: null, view: null, loading: false };

/**
 * Поиск по мере набора (VED-337).
 *
 * - Пауза `SEARCH_DEBOUNCE_MS` после последней буквы — запрос не на каждую.
 * - Новая буква отменяет и таймер, и уже ушедший запрос (`AbortController`):
 *   ответ на «Кри» не перетрёт ответ на «Кришна», даже если придёт позже.
 * - Пока ждём, прежняя выдача не исчезает — список не мигает пустотой.
 * - `retry` повторяет тот же запрос: после ошибки сети набирать заново незачем.
 */
export function usePortalSearch(searchApi: SearchApi, input: string) {
  const [state, setState] = useState<PortalSearchState>(IDLE);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const query = normalizeSearchQuery(input);
    if (!query) {
      setState(IDLE);
      return;
    }
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true }));
    const timer = setTimeout(() => {
      searchApi
        .search(query, controller.signal)
        .then((outcomes) => {
          // Ответ пришёл, но запрос уже отменён новой буквой: он про
          // прошлое слово и на экран не попадает.
          if (controller.signal.aborted) return;
          setState({ query, view: buildSearchView(outcomes), loading: false });
        })
        .catch((error: unknown) => {
          if (error instanceof SearchCancelled || controller.signal.aborted) return;
          setState({ query, view: { kind: 'error' }, loading: false });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input, searchApi, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, retry };
}
