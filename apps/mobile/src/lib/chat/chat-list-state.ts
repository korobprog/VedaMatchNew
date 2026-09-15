import type { ChatConversationSummary, ChatStreamEvent } from '@vedamatch/shared';

/**
 * Список бесед под событиями потока. Правила повторяют сайт
 * (`chat-list-view.tsx`): новая беседа или изменение вставляются целиком,
 * новое сообщение поднимает беседу наверх и увеличивает счётчик, если автор
 * не я, собственная отметка прочтения обнуляет счётчик.
 */

function sortKey(conversation: ChatConversationSummary): number {
  const stamp = conversation.lastMessageAt ?? conversation.lastMessage?.createdAt;
  const time = stamp ? new Date(stamp).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Официальный канал VedaMatch первым, за ним закреплённые, внутри групп — по
 * последнему сообщению. Порядок тот же, что отдаёт сервер.
 */
export function sortConversations(list: readonly ChatConversationSummary[]): ChatConversationSummary[] {
  return [...list].sort((a, b) => {
    if (Boolean(a.official) !== Boolean(b.official)) return a.official ? -1 : 1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return sortKey(b) - sortKey(a);
  });
}

export function applyListEvent(
  list: readonly ChatConversationSummary[],
  event: ChatStreamEvent,
  myUserId: string,
): ChatConversationSummary[] {
  switch (event.type) {
    case 'conversation.upserted': {
      const rest = list.filter((item) => item.id !== event.conversation.id);
      return sortConversations([...rest, event.conversation]);
    }
    case 'conversation.removed':
      return list.filter((item) => item.id !== event.conversationId);
    case 'message.created': {
      const target = list.find((item) => item.id === event.conversationId);
      if (!target) return [...list];
      const fromOther = event.message.author.id !== myUserId;
      const updated: ChatConversationSummary = {
        ...target,
        lastMessage: event.message,
        lastMessageAt: event.message.createdAt,
        unreadCount: fromOther ? target.unreadCount + 1 : target.unreadCount,
      };
      return sortConversations(list.map((item) => (item.id === target.id ? updated : item)));
    }
    case 'message.updated':
      return list.map((item) =>
        item.id === event.conversationId && item.lastMessage?.id === event.message.id
          ? { ...item, lastMessage: event.message }
          : item,
      );
    case 'message.deleted':
      return list.map((item) =>
        item.id === event.conversationId && item.lastMessage?.id === event.messageId
          ? { ...item, lastMessage: { ...item.lastMessage, body: '', attachments: [], deletedAt: new Date().toISOString() } }
          : item,
      );
    case 'read':
      if (event.userId !== myUserId) return [...list];
      return list.map((item) => (item.id === event.conversationId ? { ...item, unreadCount: 0 } : item));
    default:
      return [...list];
  }
}

/** Сумма непрочитанного без заглушённых бесед: для значка на вкладке. */
export function totalUnread(list: readonly ChatConversationSummary[]): number {
  return list.reduce((sum, item) => (item.muted ? sum : sum + item.unreadCount), 0);
}
