import type {
  CommunityDto,
  CommunitySearchResponse,
  CreateCommunityRequest,
  GeoSearchResult,
  MyCommunitiesResponse,
} from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';

/**
 * Мои общины, заведение новой, подсказки городов и поиск по названию.
 * Каталог общин с картой и вступление в чужую общину по-прежнему только на
 * сайте (вкладка «Общины», критерий приёмки 1 в `spec.md`) — здесь есть
 * ровно то, что нужно, чтобы завести свою ятру с телефона (VED-292).
 */
export function createCommunitiesApi(api: ApiClient) {
  return {
    mine: () => api.request<MyCommunitiesResponse>('/communities/me'),
    /**
     * Заведение общины. Карточка уходит в статусе `pending` на проверку
     * администрации портала — до решения общины нет в справочнике. Сервер
     * держит лимит: три заявки в сутки.
     */
    create: (body: CreateCommunityRequest) => api.request<CommunityDto>('/communities', { method: 'POST', body }),
    /**
     * Подсказки городов — портальный прокси к геокодеру (`GET /geo/search`),
     * тот же, что у формы общины на сайте. Община без координат не попадёт
     * на карту, поэтому город выбирают из подсказок, а не набирают руками.
     */
    geoSearch: (query: string, signal?: AbortSignal) =>
      api.request<GeoSearchResult[]>(`/geo/search?q=${encodeURIComponent(query)}`, { signal }),
    /**
     * Поиск общин по названию. Нужен форме новой группы: если имя группы
     * в точности совпало с общиной, человек мог принять его за привязку —
     * предупреждаем до того, как группа потеряется (так уже случалось, см.
     * `chat-new-conversation.tsx` на сайте).
     */
    search: (filters: { q?: string; pageSize?: number }, signal?: AbortSignal) => {
      const params = new URLSearchParams();
      if (filters.q) params.set('q', filters.q);
      if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
      const qs = params.toString();
      return api.request<CommunitySearchResponse>(`/communities${qs ? `?${qs}` : ''}`, { signal });
    },
  };
}

export type CommunitiesApi = ReturnType<typeof createCommunitiesApi>;
