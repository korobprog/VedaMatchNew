import type {
  ChatConferenceDto,
  ChatConferenceInviteDto,
} from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';

/**
 * Клиент быстрой конференции — маршруты `chat/conference/*`
 * (`apps/api/src/modules/chat/conference/chat-conference.controller.ts`).
 *
 * Карточка приглашения читается и без входа: её спрашивает гость, которому
 * прислали ссылку. Общий `ApiClient` подставит Bearer, если сессия есть, и
 * обойдётся без него, если нет, — сервер отвечает и так, и так.
 */
export function createConferenceApi(api: ApiClient) {
  return {
    /** Завести комнату и получить ссылку. */
    create: () =>
      api.request<ChatConferenceDto>('/chat/conference', { method: 'POST' }),

    /** Кто зовёт, сколько мест, можно ли войти. */
    invite: (token: string) =>
      api.request<ChatConferenceInviteDto>(
        `/chat/conference/links/${encodeURIComponent(token)}`,
      ),

    /** Войти по ссылке. Ответ — комната. */
    join: (token: string) =>
      api.request<ChatConferenceDto>(
        `/chat/conference/links/${encodeURIComponent(token)}/join`,
        { method: 'POST' },
      ),

    /** Своя ссылка: скопировать ещё раз посреди разговора. */
    room: (conversationId: string) =>
      api.request<ChatConferenceDto>(
        `/chat/conference/${encodeURIComponent(conversationId)}`,
      ),

    /** Закрыть вход по ссылке — тех, кто внутри, это не выставляет. */
    revoke: (conversationId: string) =>
      api.request<ChatConferenceDto>(
        `/chat/conference/${encodeURIComponent(conversationId)}/revoke`,
        { method: 'POST' },
      ),
  };
}
