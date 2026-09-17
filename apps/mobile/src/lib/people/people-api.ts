import type {
  ContactsCardDto,
  ContactsCreateRequestBody,
  ContactsRequestsState,
  ContactsRespondBody,
  ContactsSearchFilters,
  ContactsSearchResponse,
} from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';
import { buildPeopleSearchQuery } from './people-search-state';

/**
 * Маршруты справочника людей (`chat/people/*`), которыми пользуется
 * приложение. Контракт тот же, что у сайта (`apps/web/src/lib/chat-people-api.ts`),
 * авторизация Bearer через общий клиент.
 */
export function createPeopleApi(api: ApiClient) {
  return {
    search: (filters: Pick<ContactsSearchFilters, 'q' | 'page' | 'pageSize'>) =>
      api.request<ContactsSearchResponse>(`/chat/people/search${buildPeopleSearchQuery(filters)}`),
    card: (userId: string) => api.request<ContactsCardDto>(`/chat/people/users/${encodeURIComponent(userId)}`),
    /** Оба списка запросов и остаток суточного лимита — одним ответом. */
    requests: () => api.request<ContactsRequestsState>('/chat/people/requests'),
    /** Все изменяющие вызовы возвращают уже пересчитанное состояние списков. */
    createRequest: (body: ContactsCreateRequestBody) =>
      api.request<ContactsRequestsState>('/chat/people/requests', { method: 'POST', body }),
    respond: (requestId: string, body: ContactsRespondBody) =>
      api.request<ContactsRequestsState>(`/chat/people/requests/${encodeURIComponent(requestId)}/respond`, {
        method: 'POST',
        body,
      }),
    /** Отправитель отзывает свой ещё не рассмотренный запрос. */
    cancelRequest: (requestId: string) =>
      api.request<ContactsRequestsState>(`/chat/people/requests/${encodeURIComponent(requestId)}`, { method: 'DELETE' }),
  };
}

export type PeopleApi = ReturnType<typeof createPeopleApi>;
