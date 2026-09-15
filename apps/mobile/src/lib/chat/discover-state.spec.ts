import type { ChatConversationSummary, ChatDiscoverItem } from '@vedamatch/shared';
import { discoverActionLabel, discoverSubtitle, markJoined } from './discover-state';

function conversation(extra: Partial<ChatConversationSummary> = {}): ChatConversationSummary {
  return {
    id: 'c1',
    kind: 'group',
    state: 'active',
    visibility: 'public',
    title: 'Беседа',
    membersCount: 1,
    unreadCount: 0,
    muted: false,
    pinned: false,
    canWrite: true,
    ...extra,
  } as ChatConversationSummary;
}

function item(extra: Partial<ChatDiscoverItem> = {}): ChatDiscoverItem {
  return { conversation: conversation(), joined: false, ...extra };
}

describe('markJoined', () => {
  it('помечает нужный элемент присоединённым, остальные не трогает', () => {
    const items = [item({ conversation: conversation({ id: 'a' }) }), item({ conversation: conversation({ id: 'b' }) })];
    const next = markJoined(items, 'b');
    expect(next.find((i) => i.conversation.id === 'a')?.joined).toBe(false);
    expect(next.find((i) => i.conversation.id === 'b')?.joined).toBe(true);
  });

  it('id без совпадения — список не меняется по значению', () => {
    const items = [item()];
    expect(markJoined(items, 'zzz')).toEqual(items);
  });
});

describe('discoverSubtitle', () => {
  it('канал считает подписчиков', () => {
    expect(discoverSubtitle(conversation({ kind: 'channel', membersCount: 1 }))).toBe('Канал · 1 подписчик');
    expect(discoverSubtitle(conversation({ kind: 'channel', membersCount: 12 }))).toBe('Канал · 12 подписчиков');
  });

  it('группа считает участников', () => {
    expect(discoverSubtitle(conversation({ kind: 'group', membersCount: 3 }))).toBe('Группа · 3 участника');
  });
});

describe('discoverActionLabel', () => {
  it('канал — подписаться, группа — вступить', () => {
    expect(discoverActionLabel('channel')).toBe('Подписаться');
    expect(discoverActionLabel('group')).toBe('Вступить');
  });
});
