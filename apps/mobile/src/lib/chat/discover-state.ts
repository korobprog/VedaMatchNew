import type { ChatConversationSummary, ChatDiscoverItem } from '@vedamatch/shared';
import { withPlural } from './plural';

/**
 * Каталог открытых бесед общины (`chat/discover`): чистая логика вокруг
 * списка, вынесенная из экрана `communities/[id].tsx`.
 */

/**
 * Помечаем беседу присоединённой сразу после успешного `subscribe`, без
 * повторного запроса всего списка (см. риски VED-170 в `spec.md`).
 */
export function markJoined(items: readonly ChatDiscoverItem[], conversationId: string): ChatDiscoverItem[] {
  return items.map((item) => (item.conversation.id === conversationId ? { ...item, joined: true } : item));
}

/** «Канал · 12 подписчиков» / «Группа · 3 участника» — 1:1 с `chat-discover-view.tsx`. */
export function discoverSubtitle(conversation: ChatConversationSummary): string {
  const kindLabel = conversation.kind === 'channel' ? 'Канал' : 'Группа';
  const countLabel =
    conversation.kind === 'channel'
      ? withPlural(conversation.membersCount, 'подписчик', 'подписчика', 'подписчиков')
      : withPlural(conversation.membersCount, 'участник', 'участника', 'участников');
  return `${kindLabel} · ${countLabel}`;
}

/** Подпись действия по виду беседы: канал — подписка, группа — вступление. */
export function discoverActionLabel(kind: ChatConversationSummary['kind']): string {
  return kind === 'channel' ? 'Подписаться' : 'Вступить';
}
