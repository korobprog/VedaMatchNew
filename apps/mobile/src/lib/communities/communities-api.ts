import type { CommunityDto, CreateCommunityRequest, GeoSearchResult, MyCommunitiesResponse } from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';

/**
 * Мои общины, заведение новой и подсказки городов. Поиск по чужим общинам и
 * вступление в них по-прежнему только на сайте (вкладка «Общины», критерий
 * приёмки 1 в `spec.md`) — здесь появилось ровно то, что нужно, чтобы
 * завести свою ятру с телефона (VED-292).
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
  };
}

export type CommunitiesApi = ReturnType<typeof createCommunitiesApi>;
