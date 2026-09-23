import type {
  ChatSearchState,
  CommunitySearchResponse,
  ContactsSearchResponse,
  PortalSearchResponse,
} from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';
import { SEARCH_PER_GROUP, type SearchOutcomes, type SourceOutcome } from './search-results';
import { searchesChats } from './search-query';

/**
 * Поиск по порталу (VED-337): четыре существующие ручки параллельно, с одной
 * отменой на всех. Упавший источник — не ошибка поиска, а `failed` в своём
 * месте; решает, что показать, `buildSearchView`.
 *
 * Отменённый запрос (человек дописал слово) бросает, а не возвращает
 * «упало»: устаревший ответ не должен дойти до экрана ни в каком виде.
 */
export class SearchCancelled extends Error {
  constructor() {
    super('Поиск отменён');
    this.name = 'SearchCancelled';
  }
}

async function settle<T>(run: () => Promise<T>): Promise<SourceOutcome<T>> {
  try {
    return { status: 'ok', data: await run() };
  } catch {
    return { status: 'failed' };
  }
}

export function createSearchApi(api: ApiClient) {
  return {
    async search(query: string, signal: AbortSignal): Promise<SearchOutcomes> {
      const q = encodeURIComponent(query);
      const get = <T,>(path: string) => () => api.request<T>(path, { signal });
      const [people, communities, chats, portal] = await Promise.all([
        settle(get<ContactsSearchResponse>(`/chat/people/search?q=${q}&pageSize=${SEARCH_PER_GROUP}`)),
        settle(get<CommunitySearchResponse>(`/communities?q=${q}&pageSize=${SEARCH_PER_GROUP}`)),
        searchesChats(query)
          ? settle(get<ChatSearchState>(`/chat/search?q=${q}`))
          : Promise.resolve<SourceOutcome<ChatSearchState>>({ status: 'skipped' }),
        settle(get<PortalSearchResponse>(`/assistant/search?q=${q}`)),
      ]);
      if (signal.aborted) throw new SearchCancelled();
      return { people, communities, chats, portal };
    },
  };
}

export type SearchApi = ReturnType<typeof createSearchApi>;
