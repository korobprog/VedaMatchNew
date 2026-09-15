import type {
  ChatConversationDetail,
  ChatListState,
  ChatConversationSummary,
  ChatMessageDto,
  ChatReactionSummary,
  ChatRequestsState,
  ChatUploadResult,
  EditChatMessageRequest,
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
    /** Беззвучный режим беседы. Для официального канала это согласие на уведомления. */
    setMuted: (conversationId: string, muted: boolean) =>
      api.request<{ muted: boolean }>(`/chat/conversations/${encodeURIComponent(conversationId)}/mute`, {
        method: 'POST',
        body: { muted },
      }),
    typing: (conversationId: string) =>
      api.request<{ ok: true }>(`/chat/conversations/${encodeURIComponent(conversationId)}/typing`, { method: 'POST' }),
    /** Запросы на переписку: первые сообщения от незнакомых людей. */
    requests: () => api.request<ChatRequestsState>('/chat/requests'),
    accept: (conversationId: string) =>
      api.request<ChatConversationSummary>(`/chat/conversations/${encodeURIComponent(conversationId)}/accept`, { method: 'POST' }),
    decline: (conversationId: string) =>
      api.request<{ ok: true }>(`/chat/conversations/${encodeURIComponent(conversationId)}/decline`, { method: 'POST' }),
    /** Вложение: файл уезжает в S3 сразу при выборе, в сообщение попадает уже ссылкой. */
    upload: (conversationId: string, form: FormData) =>
      api.request<ChatUploadResult>(`/chat/conversations/${encodeURIComponent(conversationId)}/uploads`, {
        method: 'POST',
        body: form,
      }),
    edit: (messageId: string, body: EditChatMessageRequest) =>
      api.request<ChatMessageDto>(`/chat/messages/${encodeURIComponent(messageId)}/edit`, { method: 'POST', body }),
    remove: (messageId: string) =>
      api.request<{ ok: true }>(`/chat/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' }),
    setReaction: (messageId: string, emoji: string) =>
      api.request<{ reactions: ChatReactionSummary[] }>(`/chat/messages/${encodeURIComponent(messageId)}/reaction`, {
        method: 'POST',
        body: { emoji },
      }),
  };
}

export type ChatApi = ReturnType<typeof createChatApi>;
