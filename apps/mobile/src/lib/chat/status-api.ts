import type {
  ChatStatusAuthorDto,
  ChatStatusDto,
  ChatStatusFeedResponse,
  ChatStatusRing,
} from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';

/**
 * Статусы Общения (VED-129) — маршруты `chat/statuses/*`, тот же контракт,
 * что у сайта (`apps/web/src/lib/chat-client.ts`, блок «Статусы»).
 * Авторизация — Bearer через общий клиент, файлы в ответах уже подписаны
 * сервером (`ChatSignedUrlsInterceptor`).
 */
export function createStatusApi(api: ApiClient) {
  return {
    /** Лента: свои отдельно, чужие — непросмотренные впереди. */
    feed: () => api.request<ChatStatusFeedResponse>('/chat/statuses'),
    /** Кружки для аватарок списка бесед: один запрос на весь список. */
    rings: (userIds: readonly string[]) =>
      api.request<Record<string, ChatStatusRing>>(
        `/chat/statuses/rings?ids=${encodeURIComponent(userIds.join(','))}`,
      ),
    /** Живые статусы одного человека; `null` — их нет или он скрыт блокировкой. */
    ofUser: (userId: string) =>
      api.request<ChatStatusAuthorDto | null>(`/chat/statuses/users/${encodeURIComponent(userId)}`),
    /**
     * Публикация: multipart с полями `text` и `file` — форму собирает
     * вызывающий (`buildStatusForm`), файл уходит байтами, см.
     * `lib/upload/upload-form-part.ts`.
     */
    create: (form: FormData) =>
      api.request<ChatStatusDto>('/chat/statuses', { method: 'POST', body: form }),
    view: (statusId: string) =>
      api.request<{ ok: true }>(`/chat/statuses/${encodeURIComponent(statusId)}/view`, { method: 'POST' }),
    remove: (statusId: string) =>
      api.request<{ ok: true }>(`/chat/statuses/${encodeURIComponent(statusId)}`, { method: 'DELETE' }),
  };
}

export type StatusApi = ReturnType<typeof createStatusApi>;
