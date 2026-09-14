import type { ChatConversationSummary, ChatMessageDto } from '@vedamatch/shared';
import { applyListEvent, sortConversations, totalUnread } from './chat-list-state';

const ME = 'me';

function msg(id: string, authorId: string, createdAt: string): ChatMessageDto {
  return { id, conversationId: 'x', author: { id: authorId, name: 'A' }, body: id, attachments: [], reactions: [], createdAt } as ChatMessageDto;
}

function conv(id: string, at: string, extra: Partial<ChatConversationSummary> = {}): ChatConversationSummary {
  return {
    id,
    kind: 'direct',
    state: 'active',
    visibility: 'private',
    title: id,
    membersCount: 2,
    unreadCount: 0,
    muted: false,
    pinned: false,
    canWrite: true,
    lastMessageAt: at,
    ...extra,
  } as ChatConversationSummary;
}

const base = [conv('a', '2026-09-14T10:00:00Z'), conv('b', '2026-09-14T09:00:00Z')];

describe('sortConversations', () => {
  it('закреплённые сверху, дальше свежие', () => {
    const sorted = sortConversations([...base, conv('p', '2026-01-01T00:00:00Z', { pinned: true })]);
    expect(sorted.map((c) => c.id)).toEqual(['p', 'a', 'b']);
  });
});

describe('applyListEvent', () => {
  it('новое сообщение от собеседника поднимает беседу и растит счётчик', () => {
    const next = applyListEvent(base, { type: 'message.created', conversationId: 'b', message: msg('m', 'other', '2026-09-14T11:00:00Z') }, ME);
    expect(next[0].id).toBe('b');
    expect(next[0].unreadCount).toBe(1);
    expect(next[0].lastMessage?.id).toBe('m');
  });

  it('своё сообщение счётчик не трогает', () => {
    const next = applyListEvent(base, { type: 'message.created', conversationId: 'b', message: msg('m', ME, '2026-09-14T11:00:00Z') }, ME);
    expect(next[0].unreadCount).toBe(0);
  });

  it('событие по неизвестной беседе список не ломает', () => {
    const next = applyListEvent(base, { type: 'message.created', conversationId: 'zzz', message: msg('m', 'o', '2026-09-14T11:00:00Z') }, ME);
    expect(next.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('upsert вставляет или заменяет, removed убирает', () => {
    const inserted = applyListEvent(base, { type: 'conversation.upserted', conversation: conv('c', '2026-09-14T12:00:00Z') }, ME);
    expect(inserted.map((c) => c.id)).toEqual(['c', 'a', 'b']);
    const replaced = applyListEvent(inserted, { type: 'conversation.upserted', conversation: conv('a', '2026-09-14T10:00:00Z', { title: 'новое' }) }, ME);
    expect(replaced.filter((c) => c.id === 'a')).toHaveLength(1);
    expect(replaced.find((c) => c.id === 'a')?.title).toBe('новое');
    expect(applyListEvent(replaced, { type: 'conversation.removed', conversationId: 'c' }, ME).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('обнуляет счётчик только своей отметкой прочтения', () => {
    const unread = [conv('a', '2026-09-14T10:00:00Z', { unreadCount: 3 })];
    expect(applyListEvent(unread, { type: 'read', conversationId: 'a', userId: 'other', lastReadAt: 'x' }, ME)[0].unreadCount).toBe(3);
    expect(applyListEvent(unread, { type: 'read', conversationId: 'a', userId: ME, lastReadAt: 'x' }, ME)[0].unreadCount).toBe(0);
  });

  it('удаление последнего сообщения меняет превью', () => {
    const withLast = [conv('a', '2026-09-14T10:00:00Z', { lastMessage: msg('m', 'o', '2026-09-14T10:00:00Z') })];
    const next = applyListEvent(withLast, { type: 'message.deleted', conversationId: 'a', messageId: 'm' }, ME);
    expect(next[0].lastMessage?.deletedAt).toBeTruthy();
    expect(next[0].lastMessage?.body).toBe('');
  });
});

describe('totalUnread', () => {
  it('не считает заглушённые беседы', () => {
    expect(totalUnread([conv('a', 'x', { unreadCount: 2 }), conv('b', 'x', { unreadCount: 5, muted: true })])).toBe(2);
  });
});
