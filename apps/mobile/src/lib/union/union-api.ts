import type {
  CreateUserReportRequest,
  UnionBoostStatus,
  UnionConnectionCounts,
  UnionConnectionRequestsState,
  UnionCreateConnectionRequest,
  UnionCycleResetResult,
  UnionFavoritesResponse,
  UnionProfileState,
  UnionRecommendation,
  UnionRecommendationFilters,
  UnionRecommendationsResponse,
  UnionSwipeRequest,
  UnionSwipeResult,
  UnionSwipeUndoResult,
} from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';
import { recommendationsQuery } from './recommendations-query';

/**
 * Маршруты Знакомств (`union/*`), которыми пользуется приложение. Контракт
 * тот же, что у сайта: клиентские вызовы `swipe-deck.tsx`,
 * `union-likes-panel.tsx`, `connection-actions.tsx`, `report-block-menu.tsx`
 * и серверные чтения `apps/web/src/lib/union-api.ts`. Нового серверного кода
 * под приложение не заводилось.
 */
export function createUnionApi(api: ApiClient) {
  const id = (value: string) => encodeURIComponent(value);
  return {
    /** Своя анкета и прогресс заполнения; `profile: null` — анкеты ещё нет. */
    profileState: () => api.request<UnionProfileState>('/union/profile'),
    /** Выдача. 404 — у человека нет анкеты: без неё подбирать не по чему. */
    recommendations: (filters: UnionRecommendationFilters) =>
      api.request<UnionRecommendationsResponse>(`/union/recommendations${recommendationsQuery(filters)}`),
    /** Анкета одного человека — в том же виде, что в выдаче, с совместимостью. */
    userCard: (userId: string) => api.request<UnionRecommendation>(`/union/users/${id(userId)}`),

    swipe: (body: UnionSwipeRequest) =>
      api.request<UnionSwipeResult>('/union/swipes', { method: 'POST', body }),
    /** Снять последнее решение — анкета возвращается в колоду. */
    undoLastSwipe: () => api.request<UnionSwipeUndoResult>('/union/swipes/last', { method: 'DELETE' }),
    /** Новый круг: пропуски сняты, лайки и архив остаются. */
    newCycle: () => api.request<UnionCycleResetResult>('/union/swipes/new-cycle', { method: 'POST' }),

    connectionRequests: () => api.request<UnionConnectionRequestsState>('/union/connection-requests'),
    connectionCounts: () => api.request<UnionConnectionCounts>('/union/connection-requests/counts'),
    /** «Познакомиться» с экрана анкеты — заявка без свайпа. */
    createConnection: (body: UnionCreateConnectionRequest) =>
      api.request<unknown>('/union/connection-requests', { method: 'POST', body }),
    respond: (requestId: string, action: 'accept' | 'decline') =>
      api.request<unknown>(`/union/connection-requests/${id(requestId)}/${action}`, { method: 'PATCH' }),

    /** Звёздочки среди входящих лайков — личная отметка, человек о ней не узнает. */
    favorites: () => api.request<UnionFavoritesResponse>('/union/favorites'),
    setFavorite: (userId: string, favorite: boolean) =>
      api.request<unknown>(`/union/favorites/${id(userId)}`, { method: favorite ? 'POST' : 'DELETE' }),

    /** Убрать анкету в архив: из выдачи уходит, пока не вернут вручную. */
    archive: (userId: string) => api.request<unknown>(`/union/archive/${id(userId)}`, { method: 'POST' }),

    /** «Внимание»: анкета показывается раньше остальных. В бете бесплатно. */
    boostStatus: () => api.request<UnionBoostStatus>('/union/boost/status'),
    activateBoost: () => api.request<UnionBoostStatus>('/union/boost', { method: 'POST' }),

    block: (userId: string) => api.request<unknown>(`/union/users/${id(userId)}/block`, { method: 'POST' }),
    report: (userId: string, body: CreateUserReportRequest) =>
      api.request<unknown>(`/union/users/${id(userId)}/report`, { method: 'POST', body }),
  };
}

export type UnionApi = ReturnType<typeof createUnionApi>;
