import type {
  ChatConversationDetail,
  ChatListState,
  ChatMessageDto,
  SendChatMessageRequest,
} from '@vedamatch/shared';
import type { ApiClient } from '@/lib/api/client';

/**
 * Маршруты чата, которыми пользуется приложение. Контракт тот же, что у сайта
 * (`apps/web/src/lib/chat-client.ts`), авторизация Bearer через общий клиент.
 */
export function createChatApi(api: ApiClient) {
  return {
    list: () => api.request<ChatListState>('/chat/conversations'),
    /** Беседа с последней страницей; `before` — createdAt старейшего загруженного. */
    detail: (conversationId: string, before?: string) =>
      api.request<ChatConversationDetail>(
        `/chat/conversations/${encodeURIComponent(conversationId)}${before ? `?before=${encodeURIComponent(before)}` : ''}`,
      ),
    send: (conversationId: string, body: SendChatMessageRequest) =>
      api.request<ChatMessageDto>(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: 'POST',
        body,
      }),
    markRead: (conversationId: string) =>
      api.request<{ lastReadAt: string }>(`/chat/conversations/${encodeURIComponent(conversationId)}/read`, {
        method: 'POST',
      }),
    typing: (conversationId: string) =>
      api.request<{ ok: true }>(`/chat/conversations/${encodeURIComponent(conversationId)}/typing`, { method: 'POST' }),
  };
}

export type ChatApi = ReturnType<typeof createChatApi>;
