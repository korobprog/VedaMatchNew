import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatConversationsService } from './chat-conversations.service';
import { ChatEventsService } from './chat-events.service';

const createdAt = new Date('2026-08-22T10:00:00.000Z');

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
    id: `member-${userId}`,
    conversationId: 'conversation-1',
    userId,
    role: 'member',
    joinedAt: createdAt,
    lastReadAt: null,
    mutedUntil: null,
    pinnedAt: null,
    leftAt: null,
    user: user(userId),
    ...over,
  };
}

function conversation(over: Record<string, unknown> = {}) {
  return {
    id: 'conversation-1',
    kind: 'group',
    state: 'active',
    title: 'Киртан-группа',
    description: null,
    avatarKey: null,
    avatarUrl: null,
    directKey: null,
    communityId: null,
    createdById: 'owner',
    requestedById: null,
    lastMessageAt: createdAt,
    pinnedMessageId: null,
    pinnedMessage: null,
    createdAt,
    updatedAt: createdAt,
    community: null,
    members: [member('owner', { role: 'owner' }), member('guest')],
    ...over,
  };
}

/**
 * Заглушка Prisma без заранее навязанного типа результата: строгий
 * TypeScript иначе выводит тип по первой реализации, и следующий
 * mockResolvedValue в тесте перестаёт компилироваться.
 */
function fn(impl?: (...args: never[]) => unknown): jest.Mock {
  return jest.fn(impl as never);
}

describe('ChatConversationsService', () => {
  const prisma = {
    chatConversation: {
      findUnique: fn(),
      findMany: fn(),
      count: fn(() => Promise.resolve(0)),
      create: fn(),
      update: fn(),
    },
    chatMember: {
      updateMany: fn(() => Promise.resolve({ count: 1 })),
      findFirst: fn(),
      findMany: fn(() => Promise.resolve([])),
      upsert: fn(),
    },
    chatMessage: {
      count: fn(() => Promise.resolve(0)),
      findFirst: fn(() => Promise.resolve(null)),
      findMany: fn(() => Promise.resolve([])),
    },
    user: { findUnique: fn(), findMany: fn(() => Promise.resolve([])) },
    userBlock: {
      findFirst: fn(() => Promise.resolve(null)),
      findMany: fn(() => Promise.resolve([])),
    },
    communityMember: {
      count: fn(() => Promise.resolve(0)),
      findFirst: fn(),
      findMany: fn(() => Promise.resolve([])),
    },
  };

  const events = { publish: fn() };
  const bus = { emit: fn() };
  const uploads = { removeMany: fn() };

  const service = new ChatConversationsService(
    prisma as unknown as PrismaService,
    events as unknown as ChatEventsService,
    bus as never,
    uploads as never,
  );

  beforeEach(() => {
    // clearAllMocks стирает вызовы, но оставляет заданные реализации:
    // блокировка из соседнего теста иначе переезжает в следующий.
    jest.clearAllMocks();
    prisma.userBlock.findFirst.mockResolvedValue(null);
    prisma.chatConversation.count.mockResolvedValue(0);
    prisma.chatMessage.count.mockResolvedValue(0);
    prisma.chatMessage.findFirst.mockResolvedValue(null);
  });

  describe('requireConversation', () => {
    it('прячет чужую беседу за «не найдено», а не за «нет прав»', async () => {
      prisma.chatConversation.findUnique.mockResolvedValue(conversation());
      await expect(
        service.requireConversation('conversation-1', 'stranger'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('участнику беседу отдаёт', async () => {
      prisma.chatConversation.findUnique.mockResolvedValue(conversation());
      await expect(
        service.requireConversation('conversation-1', 'guest'),
      ).resolves.toMatchObject({ id: 'conversation-1' });
    });
  });

  describe('createDirect', () => {
    it('заводит диалог запросом, а не сразу перепиской', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'other',
        accountStatus: 'active',
      });
      prisma.chatConversation.findUnique.mockResolvedValue(null);
      prisma.chatConversation.create.mockResolvedValue(
        conversation({
          kind: 'direct',
          state: 'request',
          requestedById: 'me',
          members: [member('me'), member('other')],
        }),
      );

      await service.create('me', { kind: 'direct', userId: 'other' });

      const data = (
        (prisma.chatConversation.create.mock.calls as unknown[][])[0][0] as {
          data: {
            state: string;
            requestedById: string;
            directKey: string;
          };
        }
      ).data;
      expect(data.state).toBe('request');
      expect(data.requestedById).toBe('me');
      // Ключ пары держит уникальность в базе — без него гонка заводит два
      // диалога на одних и тех же людей.
      expect(data.directKey).toBe('me:other');
    });

    it('не пускает к заблокированному', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'other',
        accountStatus: 'active',
      });
      prisma.userBlock.findFirst.mockResolvedValue({ id: 'block-1' });

      await expect(
        service.create('me', { kind: 'direct', userId: 'other' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.chatConversation.create).not.toHaveBeenCalled();
    });

    it('не заводит второй диалог на ту же пару', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'other',
        accountStatus: 'active',
      });
      prisma.chatConversation.findUnique.mockResolvedValue(
        conversation({
          kind: 'direct',
          state: 'active',
          members: [member('me'), member('other')],
        }),
      );

      await service.create('me', { kind: 'direct', userId: 'other' });
      expect(prisma.chatConversation.create).not.toHaveBeenCalled();
    });

    it('не даёт переписать отклонённый запрос заново', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'other',
        accountStatus: 'active',
      });
      prisma.chatConversation.findUnique.mockResolvedValue(
        conversation({
          kind: 'direct',
          state: 'declined',
          requestedById: 'me',
          members: [member('me'), member('other')],
        }),
      );

      await expect(
        service.create('me', { kind: 'direct', userId: 'other' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('createGroup', () => {
    it('не даёт завести группу в чужой общине', async () => {
      prisma.communityMember.findFirst.mockResolvedValue(null);

      await expect(
        service.create('me', {
          kind: 'group',
          title: 'Киртан-кружок',
          communityId: 'community-1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.chatConversation.create).not.toHaveBeenCalled();
    });

    it('админ общины заводит группу открытой и привязанной к общине', async () => {
      prisma.communityMember.findFirst.mockResolvedValue({ id: 'member-1' });
      prisma.chatConversation.create.mockResolvedValue(
        conversation({ communityId: 'community-1' }),
      );

      await service.create('me', {
        kind: 'group',
        title: 'Киртан-кружок',
        communityId: 'community-1',
      });

      const data = (
        (prisma.chatConversation.create.mock.calls as unknown[][])[0][0] as {
          data: { communityId: string; visibility: string };
        }
      ).data;
      expect(data.communityId).toBe('community-1');
      expect(data.visibility).toBe('public');
    });

    it('явный visibility: private перебивает открытость общины', async () => {
      prisma.communityMember.findFirst.mockResolvedValue({ id: 'member-1' });
      prisma.chatConversation.create.mockResolvedValue(
        conversation({ communityId: 'community-1' }),
      );

      await service.create('me', {
        kind: 'group',
        title: 'Закрытый совет',
        communityId: 'community-1',
        visibility: 'private',
      });

      const data = (
        (prisma.chatConversation.create.mock.calls as unknown[][])[0][0] as {
          data: { visibility: string };
        }
      ).data;
      expect(data.visibility).toBe('private');
    });

    it('группа без общины остаётся закрытой по умолчанию, прав не проверяет', async () => {
      prisma.chatConversation.create.mockResolvedValue(conversation());

      await service.create('me', { kind: 'group', title: 'Друзья' });

      expect(prisma.communityMember.findFirst).not.toHaveBeenCalled();
      const data = (
        (prisma.chatConversation.create.mock.calls as unknown[][])[0][0] as {
          data: { communityId: string | null; visibility: string };
        }
      ).data;
      expect(data.communityId).toBeNull();
      expect(data.visibility).toBe('private');
    });
  });

  describe('accept и decline', () => {
    const request = conversation({
      kind: 'direct',
      state: 'request',
      requestedById: 'sender',
      members: [member('sender'), member('recipient')],
    });

    it('принимает получатель, а не отправитель', async () => {
      prisma.chatConversation.findUnique.mockResolvedValue(request);
      await expect(
        service.accept('sender', 'conversation-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('принятие переводит диалог в обычный', async () => {
      prisma.chatConversation.findUnique.mockResolvedValue(request);
      prisma.chatConversation.update.mockResolvedValue({
        ...request,
        state: 'active',
      });

      await service.accept('recipient', 'conversation-1');
      expect(prisma.chatConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { state: 'active' } }),
      );
      // Обе стороны должны увидеть, что запрос стал перепиской.
      expect(events.publish).toHaveBeenCalled();
    });

    it('отклонение закрывает диалог насовсем', async () => {
      prisma.chatConversation.findUnique.mockResolvedValue(request);
      await service.decline('recipient', 'conversation-1');
      expect(prisma.chatConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { state: 'declined' } }),
      );
    });
  });

  describe('участники', () => {
    it('владельца не убирает даже администратор', async () => {
      prisma.chatConversation.findUnique.mockResolvedValue(
        conversation({
          members: [
            member('owner', { role: 'owner' }),
            member('admin', { role: 'admin' }),
          ],
        }),
      );

      await expect(
        service.removeMember('admin', 'conversation-1', 'owner'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.chatMember.updateMany).not.toHaveBeenCalled();
    });

    it('роли раздаёт только владелец', async () => {
      prisma.chatConversation.findUnique.mockResolvedValue(
        conversation({
          members: [
            member('owner', { role: 'owner' }),
            member('admin', { role: 'admin' }),
            member('guest'),
          ],
        }),
      );

      await expect(
        service.setMemberRole('admin', 'conversation-1', 'guest', 'admin'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      await service.setMemberRole('owner', 'conversation-1', 'guest', 'admin');
      expect(prisma.chatMember.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { role: 'admin' } }),
      );
    });

    it('уход из беседы помечает участие, а не стирает его', async () => {
      prisma.chatConversation.findUnique.mockResolvedValue(conversation());
      await service.leave('guest', 'conversation-1');

      const call = (
        prisma.chatMember.updateMany.mock.calls as unknown[][]
      )[0][0] as {
        where: { userId: string };
        data: { leftAt: Date };
      };
      expect(call.where).toMatchObject({ userId: 'guest' });
      expect(call.data.leftAt).toBeInstanceOf(Date);
    });
  });

  describe('закрепление', () => {
    it('в группе закрепляет владелец, а рядовой участник — нет', async () => {
      prisma.chatConversation.findUnique.mockResolvedValue(conversation());
      await expect(
        service.pinMessage('guest', 'conversation-1', 'message-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('закрепляет только сообщение из этой же беседы', async () => {
      prisma.chatConversation.findUnique.mockResolvedValue(conversation());
      prisma.chatMessage.findFirst.mockResolvedValue(null);

      await expect(
        service.pinMessage('owner', 'conversation-1', 'чужое-сообщение'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('search', () => {
    it('на коротком запросе не ходит в базу', async () => {
      const result = await service.search('me', 'ки');
      expect(result.hits).toEqual([]);
      expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });

    it('ищет только в беседах, где человек состоит', async () => {
      prisma.chatMessage.findMany.mockResolvedValue([]);
      await service.search('me', 'караталы');

      const where = (
        (prisma.chatMessage.findMany.mock.calls as unknown[][])[0][0] as {
          where: {
            conversation: { members: { some: unknown } };
            deletedAt: Date | null;
          };
        }
      ).where;
      expect(where.conversation.members.some).toMatchObject({
        userId: 'me',
        leftAt: null,
      });
      expect(where.deletedAt).toBeNull();
    });
  });
});
