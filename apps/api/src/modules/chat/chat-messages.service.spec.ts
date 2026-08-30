import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ChatConversationsService } from './chat-conversations.service';
import { ChatEventsService } from './chat-events.service';
import { ChatMessagesService } from './chat-messages.service';
import { ChatPresenceService } from './chat-presence.service';
import type { ChatUploadsService } from './chat-uploads.service';

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
    userId,
    role: 'member',
    leftAt: null,
    mutedUntil: null,
    user: user(userId),
    ...over,
  };
}

function conversation(over: Record<string, unknown> = {}) {
  return {
    id: 'conversation-1',
    kind: 'direct',
    state: 'active',
    title: null,
    requestedById: null,
    members: [member('me'), member('other')],
    ...over,
  };
}

function storedMessage(over: Record<string, unknown> = {}) {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    authorId: 'me',
    author: user('me'),
    body: 'привет',
    replyToId: null,
    replyTo: null,
    attachments: [],
    reactions: [],
    editedAt: null,
    deletedAt: null,
    createdAt,
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

describe('ChatMessagesService', () => {
  const prisma = {
    chatMessage: {
      create: fn(() => Promise.resolve(storedMessage())),
      update: fn(() => Promise.resolve(storedMessage())),
      findUnique: fn(),
      findFirst: fn(),
      count: fn(() => Promise.resolve(0)),
    },
    chatConversation: { update: fn() },
    userBlock: { findFirst: fn(() => Promise.resolve(null)) },
    chatMember: { updateMany: fn() },
    chatMessageReaction: {
      findUnique: fn(() => Promise.resolve(null)),
      create: fn(),
      update: fn(),
      delete: fn(),
      findMany: fn(() => Promise.resolve([])),
    },
  };

  const conversations = {
    requireConversation: fn(),
    recipients: fn(() => ['me', 'other']),
  };
  const events = { publish: fn() };
  const bus = { emit: fn() };
  const chatPresence = { isViewing: fn(() => Promise.resolve(false)) };
  /** Начало адресов бакета — как у настроенного ChatUploadsService. */
  const uploads = { storagePrefix: 'https://cdn.vedamatch.ru/' };

  const service = new ChatMessagesService(
    prisma as unknown as PrismaService,
    conversations as unknown as ChatConversationsService,
    events as unknown as ChatEventsService,
    bus as never,
    chatPresence as unknown as ChatPresenceService,
    uploads as unknown as ChatUploadsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    chatPresence.isViewing.mockResolvedValue(false);
    prisma.chatMessage.count.mockResolvedValue(0);
    prisma.chatMessage.create.mockResolvedValue(storedMessage());
    prisma.chatMessageReaction.findUnique.mockResolvedValue(null);
    prisma.chatMessageReaction.findMany.mockResolvedValue([]);
    prisma.userBlock.findFirst.mockResolvedValue(null);
    conversations.requireConversation.mockResolvedValue(conversation());
  });

  describe('send', () => {
    it('пустое сообщение без вложений не отправляется', async () => {
      await expect(
        service.send('me', 'conversation-1', { body: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    });

    it('запрос даёт автору ровно одно сообщение', async () => {
      conversations.requireConversation.mockResolvedValue(
        conversation({ state: 'request', requestedById: 'me' }),
      );
      prisma.chatMessage.count.mockResolvedValue(1);

      await expect(
        service.send('me', 'conversation-1', { body: 'второе' }),
      ).rejects.toThrow('Запрос даёт одно сообщение — дождитесь ответа');
    });

    it('получатель запроса молчит, пока не примет', async () => {
      conversations.requireConversation.mockResolvedValue(
        conversation({ state: 'request', requestedById: 'other' }),
      );

      await expect(
        service.send('me', 'conversation-1', { body: 'ответ' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('заблокированному в личном диалоге писать нельзя', async () => {
      // Блокируют посреди переписки: диалог к этому времени уже есть, и
      // проверки при его заведении для защиты не хватает.
      prisma.userBlock.findFirst.mockResolvedValue({ id: 'block-1' });

      await expect(
        service.send('me', 'conversation-1', { body: 'привет' }),
      ).rejects.toThrow('Переписка недоступна');
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    });

    it('в группе блокировка не спрашивается: людей там больше двоих', async () => {
      conversations.requireConversation.mockResolvedValue(
        conversation({ kind: 'group' }),
      );

      await service.send('me', 'conversation-1', { body: 'привет' });

      expect(prisma.userBlock.findFirst).not.toHaveBeenCalled();
    });

    it('чужой адрес вложения не принимается', async () => {
      await expect(
        service.send('me', 'conversation-1', {
          body: '',
          attachments: [{ kind: 'image', url: 'https://чужой/pixel.gif' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    });

    it('в канал рядовой участник не пишет', async () => {
      conversations.requireConversation.mockResolvedValue(
        conversation({ kind: 'channel' }),
      );

      await expect(
        service.send('me', 'conversation-1', { body: 'привет' }),
      ).rejects.toThrow('В канал пишет администрация общины');
    });

    it('цитата принимается только из этой же беседы', async () => {
      prisma.chatMessage.findFirst.mockResolvedValue(null);

      await expect(
        service.send('me', 'conversation-1', {
          body: 'ответ',
          replyToId: 'чужое-сообщение',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('своё сообщение сразу помечается прочитанным', async () => {
      await service.send('me', 'conversation-1', { body: 'привет' });

      // Иначе счётчик непрочитанного у отправителя растёт от собственных слов.
      expect(prisma.chatMember.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { conversationId: 'conversation-1', userId: 'me' },
        }),
      );
      expect(prisma.chatConversation.update).toHaveBeenCalled();
      expect(events.publish).toHaveBeenCalled();
    });

    it('уведомление уходит собеседнику и не уходит беззвучному', async () => {
      conversations.requireConversation.mockResolvedValue(
        conversation({
          members: [
            member('me'),
            member('other'),
            member('muted', {
              mutedUntil: new Date(Date.now() + 60_000),
            }),
          ],
        }),
      );

      await service.send('me', 'conversation-1', { body: 'привет' });

      // notify() теперь асинхронна и не дожидается своих emit — они
      // перемежаются с синхронным emit из announceActivity(), у которого
      // нет recipientId, поэтому его отфильтровываем.
      const recipients = bus.emit.mock.calls
        .map((call: unknown[]) => (call[1] as { recipientId?: string }).recipientId)
        .filter((recipientId): recipientId is string => recipientId !== undefined);
      expect(recipients).toEqual(['other']);
    });

    it('тому, кто сейчас смотрит в эту беседу, уведомление не уходит', async () => {
      chatPresence.isViewing.mockImplementation((userId: string) =>
        Promise.resolve(userId === 'other'),
      );

      await service.send('me', 'conversation-1', { body: 'привет' });

      expect(chatPresence.isViewing).toHaveBeenCalledWith(
        'other',
        'conversation-1',
      );
      // bus.emit всё равно срабатывает для announceActivity() (у него нет
      // recipientId и он не зависит от присутствия) — подавляется только
      // адресное уведомление, поэтому проверяем именно его отсутствие.
      const recipients = bus.emit.mock.calls
        .map((call: unknown[]) => (call[1] as { recipientId?: string }).recipientId)
        .filter((recipientId): recipientId is string => recipientId !== undefined);
      expect(recipients).toEqual([]);
      // Живая доставка в открытый чат остаётся: подавляется только уведомление.
      expect(events.publish).toHaveBeenCalled();
    });
  });

  describe('setReaction', () => {
    beforeEach(() => {
      prisma.chatMessage.findUnique.mockResolvedValue({
        id: 'message-1',
        conversationId: 'conversation-1',
        authorId: 'other',
        deletedAt: null,
      });
    });

    it('заблокированный не ставит реакции', async () => {
      prisma.userBlock.findFirst.mockResolvedValue({ id: 'block-1' });

      await expect(
        service.setReaction('me', 'message-1', '🙏'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.chatMessageReaction.create).not.toHaveBeenCalled();
    });

    it('не принимает эмодзи вне белого списка', async () => {
      await expect(
        service.setReaction('me', 'message-1', '💩'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('повторный тот же эмодзи снимает реакцию', async () => {
      prisma.chatMessageReaction.findUnique.mockResolvedValue({
        id: 'reaction-1',
        emoji: '🙏',
      });

      await service.setReaction('me', 'message-1', '🙏');
      expect(prisma.chatMessageReaction.delete).toHaveBeenCalled();
      expect(prisma.chatMessageReaction.create).not.toHaveBeenCalled();
    });

    it('другой эмодзи заменяет прежний, а не добавляет второй', async () => {
      prisma.chatMessageReaction.findUnique.mockResolvedValue({
        id: 'reaction-1',
        emoji: '🙏',
      });

      await service.setReaction('me', 'message-1', '🔥');
      expect(prisma.chatMessageReaction.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { emoji: '🔥' } }),
      );
      expect(prisma.chatMessageReaction.create).not.toHaveBeenCalled();
    });
  });

  describe('edit и remove', () => {
    it('чужое сообщение не правится', async () => {
      prisma.chatMessage.findUnique.mockResolvedValue({
        id: 'message-1',
        conversationId: 'conversation-1',
        authorId: 'other',
        deletedAt: null,
      });

      await expect(
        service.edit('me', 'message-1', 'подмена'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('удаление мягкое: сообщение остаётся в ленте пустым', async () => {
      prisma.chatMessage.findUnique.mockResolvedValue({
        id: 'message-1',
        conversationId: 'conversation-1',
        authorId: 'me',
        deletedAt: null,
      });

      await service.remove('me', 'message-1');
      const data = (
        (prisma.chatMessage.update.mock.calls as unknown[][])[0][0] as {
          data: { deletedAt: Date };
        }
      ).data;
      expect(data.deletedAt).toBeInstanceOf(Date);
    });
  });
});
