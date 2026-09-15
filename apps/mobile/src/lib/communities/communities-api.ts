import type { MyCommunitiesResponse } from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';

/**
 * Мои общины: активное участие и заявки на рассмотрении. Вступление в
 * новую общину и поиск по каталогу — только на сайте, здесь не дублируется
 * (см. вкладку «Общины», критерий приёмки 1 в `spec.md`).
 */
export function createCommunitiesApi(api: ApiClient) {
  return {
    mine: () => api.request<MyCommunitiesResponse>('/communities/me'),
  };
}

export type CommunitiesApi = ReturnType<typeof createCommunitiesApi>;
