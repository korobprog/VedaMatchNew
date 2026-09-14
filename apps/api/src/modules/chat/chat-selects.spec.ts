import { chatConversationInclude } from './chat-selects';
import { toConversationSummary, type ChatConversationRow } from './chat-dto';

describe('chatConversationInclude', () => {
  it('в официальном канале грузит только смотрящего, цель действия и администраторов', () => {
    const include = chatConversationInclude('viewer', ['target']);

    expect(include.members.where.OR).toEqual([
      { conversation: { is: { official: false } } },
      { userId: { in: ['viewer', 'target'] } },
      { role: { in: ['owner', 'admin'] } },
    ]);
  });

  it('число участников считает база, без вышедших', () => {
    expect(chatConversationInclude('viewer')._count).toEqual({
      select: { members: { where: { leftAt: null } } },
    });
  });
});

describe('toConversationSummary: число участников', () => {
  const createdAt = new Date('2026-09-14T10:00:00.000Z');
  const viewer = {
    id: 'm1',
    conversationId: 'c1',
    userId: 'viewer',
    role: 'member',
    joinedAt: createdAt,
    lastReadAt: null,
    mutedUntil: null,
    pinnedAt: null,
    leftAt: null,
    user: {
      id: 'viewer',
      name: 'viewer',
      spiritualName: null,
      avatarUrl: null,
      lastSeenAt: null,
    },
  };
  const row = {
    id: 'c1',
    kind: 'channel',
    state: 'active',
    visibility: 'public',
    title: 'VedaMatch',
    avatarUrl: null,
    requestedById: null,
    official: true,
    community: null,
    members: [viewer],
  };

  it('берёт счётчик из базы, когда он приехал', () => {
    const summary = toConversationSummary(
      { ...row, _count: { members: 1200 } } as unknown as ChatConversationRow,
      'viewer',
      { unreadCount: 0 },
    );
    expect(summary.membersCount).toBe(1200);
  });

  it('без счётчика считает загруженных участников', () => {
    const summary = toConversationSummary(
      row as unknown as ChatConversationRow,
      'viewer',
      { unreadCount: 0 },
    );
    expect(summary.membersCount).toBe(1);
  });
});
