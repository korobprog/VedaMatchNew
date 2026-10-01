import { PrismaService } from '../../prisma/prisma.service';
import { ChatConversationsService } from './chat-conversations.service';
import { directKey } from './direct-key';
import type { ChatEventsService } from './chat-events.service';
import type { ChatPresenceService } from './chat-presence.service';
import type { ChatUploadsService } from './chat-uploads.service';

const createdAt = new Date('2026-09-30T10:00:00.000Z');

function user(id: string) {
  return {
    id,
    name: id,
    spiritualName: null,
    avatarUrl: null,
    lastSeenAt: null,
  };
}

function member(userId: string, over: Record<string, unknown> = {}) {
  return {
    userId,
    role: 'member',
    leftAt: null,
    mutedUntil: null,
    pinnedAt: null,
    lastReadAt: null,
    joinedAt: createdAt,
    user: user(userId),
    ...over,
  };
}

function conversationRow(over: Record<string, unknown> = {}) {
  return {
    id: 'conversation-1',
    kind: 'direct',
    state: 'active',
    visibility: 'private',
    title: null,
    avatarUrl: null,
    description: null,
    community: null,
    official: false,
    requestedById: null,
    directKey: 'me|other',
    createdById: 'other',
    createdAt,
    updatedAt: createdAt,
    lastMessageAt: createdAt,
    members: [member('me'), member('other')],
    pinnedMessage: null,
    ...over,
  };
}

function messageRow(over: Record<string, unknown> = {}) {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    authorId: 'other',
    author: user('other'),
    body: 'привет',
    replyToId: null,
    replyTo: null,
    attachments: [],
    reactions: [],
    editedAt: null,
    deletedAt: null,
    viewsCount: 0,
    forwardedFrom: null,
    createdAt,
    ...over,
  };
}

/** Заглушка Prisma без навязанного типа результата — см. chat-messages.service.spec. */
function fn(impl?: (...args: never[]) => unknown): jest.Mock {
  return jest.fn(impl as never);
}

// VED-686: мини-чат личной страницы находит переписку, но не заводит её.
describe('ChatConversationsService.directWith', () => {
  const prisma = {
    chatConversation: {
      findUnique: fn(() => Promise.resolve(conversationRow())),
    },
    chatMessage: {
      findMany: fn(() => Promise.resolve([messageRow()])),
      findFirst: fn(() => Promise.resolve(messageRow())),
      count: fn(() => Promise.resolve(1)),
    },
    chatConferenceLink: { findUnique: fn(() => Promise.resolve(null)) },
  };
  const events = { publish: fn() };
  const bus = { emit: fn() };
  const chatPresence = { isViewing: fn(() => Promise.resolve(false)) };
  const uploads = { storagePrefix: 'https://cdn.vedamatch.ru/' };

  const service = new ChatConversationsService(
    prisma as unknown as PrismaService,
    events as unknown as ChatEventsService,
    bus as never,
    uploads as unknown as ChatUploadsService,
    chatPresence as unknown as ChatPresenceService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.chatConversation.findUnique.mockResolvedValue(conversationRow());
    prisma.chatMessage.findMany.mockResolvedValue([messageRow()]);
    prisma.chatMessage.findFirst.mockResolvedValue(messageRow());
    prisma.chatMessage.count.mockResolvedValue(1);
    prisma.chatConferenceLink.findUnique.mockResolvedValue(null);
  });

  it('с собой диалога не бывает и искать его не нужно', async () => {
    await expect(service.directWith('me', 'me')).resolves.toBeNull();
    await expect(service.directWith('me', '')).resolves.toBeNull();
    expect(prisma.chatConversation.findUnique).not.toHaveBeenCalled();
  });

  it('без переписки отдаёт null, а не ошибку: страница показывает пустой мини-чат', async () => {
    prisma.chatConversation.findUnique.mockResolvedValue(null);
    await expect(service.directWith('me', 'other')).resolves.toBeNull();
  });

  it('вышедший из диалога не открывает его чужой страницей', async () => {
    prisma.chatConversation.findUnique.mockResolvedValue(
      conversationRow({
        members: [member('me', { leftAt: createdAt }), member('other')],
      }),
    );
    await expect(service.directWith('me', 'other')).resolves.toBeNull();
  });

  it('отдаёт переписку с сообщениями и правом писать', async () => {
    const detail = await service.directWith('me', 'other');
    expect(detail).toMatchObject({
      id: 'conversation-1',
      canWrite: true,
      hasMore: false,
    });
    expect(detail?.messages).toHaveLength(1);
    expect(detail?.messages[0]).toMatchObject({ body: 'привет' });
    // Ищем по ключу пары, а не перебором бесед.
    expect(prisma.chatConversation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { directKey: directKey('me', 'other') } }),
    );
  });

  it('мой ждущий ответа запрос права писать не даёт', async () => {
    prisma.chatConversation.findUnique.mockResolvedValue(
      conversationRow({ state: 'request', requestedById: 'me' }),
    );
    const detail = await service.directWith('me', 'other');
    expect(detail).toMatchObject({ state: 'request', canWrite: false });
  });
});
