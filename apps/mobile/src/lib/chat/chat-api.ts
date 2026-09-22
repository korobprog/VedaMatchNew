import type {
  ChatChannelCommunitiesState,
  ChatConversationDetail,
  ChatConversationVisibility,
  ChatListState,
  ChatConversationSummary,
  ChatDiscoverState,
  ChatMemberRole,
  ChatMessageDto,
  ChatReactionSummary,
  ChatRequestsState,
  ChatUploadResult,
  ChatUserSummary,
  CreateChatConversationRequest,
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
    /**
     * Личный диалог с человеком из справочника «Люди»: идемпотентно — если
     * беседа уже есть, сервер вернёт её же, а не заведёт вторую
     * (`chat-conversations.service.ts:createDirect`).
     */
    createDirect: (userId: string) =>
      api.request<ChatConversationSummary>('/chat/conversations', {
        method: 'POST',
        body: { kind: 'direct', userId } satisfies CreateChatConversationRequest,
      }),
    /**
     * Групповая беседа или канал общины — та же ручка, что у личного диалога,
     * разбор по `kind` на сервере (`chat-conversations.service.ts:create`).
     */
    create: (body: CreateChatConversationRequest) =>
      api.request<ChatConversationSummary>('/chat/conversations', { method: 'POST', body }),
    /**
     * Кого можно позвать в группу: только те, с кем уже есть личная
     * переписка. Сервер сам отсеивает заблокированных в обе стороны.
     */
    people: () => api.request<{ people: ChatUserSummary[] }>('/chat/people'),
    /** Общины, где смотрящий вправе завести канал или беседу общины. */
    channelCommunities: () => api.request<ChatChannelCommunitiesState>('/chat/channel-communities'),
    addMembers: (conversationId: string, userIds: string[]) =>
      api.request<{ added: number }>(`/chat/conversations/${encodeURIComponent(conversationId)}/members`, {
        method: 'POST',
        body: { userIds },
      }),
    removeMember: (conversationId: string, userId: string) =>
      api.request<{ ok: true }>(
        `/chat/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
      ),
    setMemberRole: (conversationId: string, userId: string, role: Exclude<ChatMemberRole, 'owner'>) =>
      api.request<{ role: ChatMemberRole }>(
        `/chat/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}/role`,
        { method: 'POST', body: { role } },
      ),
    /** Название, описание и открытость беседы. */
    updateConversation: (
      conversationId: string,
      patch: { title?: string; description?: string; visibility?: ChatConversationVisibility },
    ) =>
      api.request<ChatConversationSummary>(`/chat/conversations/${encodeURIComponent(conversationId)}`, {
        method: 'POST',
        body: patch,
      }),
    /**
     * Выйти самому. У этого пути на сервере отдельный обработчик
     * (`DELETE chat/conversations/:id/members/me`), объявленный в
     * `chat.controller.ts` непосредственно перед
     * `DELETE .../members/:userId` — там же стоит и комментарий, почему
     * порядок важен: Nest сверяет маршруты по порядку объявления, и при
     * обратном «me» ушло бы в удаление участника с ответом «Участник не
     * найден». Своего id сюда подставлять не нужно.
     */
    leave: (conversationId: string) =>
      api.request<{ ok: true }>(`/chat/conversations/${encodeURIComponent(conversationId)}/members/me`, {
        method: 'DELETE',
      }),
    /** Удалить беседу со всей перепиской — только владельцу. */
    removeConversation: (conversationId: string) =>
      api.request<{ ok: true }>(`/chat/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' }),
    /**
     * Каталог открытых бесед: чаты и каналы, куда можно войти самому.
     * `communityId` — фильтр по конкретной общине (вкладка «Общины», экран
     * `communities/[id]`); без него сервер отдаёт вообще все публичные
     * беседы портала, экран общины обязан всегда передавать id.
     */
    discover: (params: { communityId?: string; q?: string } = {}) => {
      const search = new URLSearchParams();
      if (params.communityId) search.set('communityId', params.communityId);
      if (params.q) search.set('q', params.q);
      const qs = search.toString();
      return api.request<ChatDiscoverState>(`/chat/discover${qs ? `?${qs}` : ''}`);
    },
    /** Войти в открытую беседу самому: подписаться на канал или вступить в группу. */
    subscribe: (conversationId: string) =>
      api.request<{ ok: true }>(`/chat/conversations/${encodeURIComponent(conversationId)}/subscribe`, { method: 'POST' }),
  };
}

export type ChatApi = ReturnType<typeof createChatApi>;
