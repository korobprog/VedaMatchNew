import { ForbiddenException } from '@nestjs/common';
import { ADMIN_AUDIT_ACTIONS, type AdminAuditEvent } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { ModerationService } from '../moderation/moderation.service';
import { ChatReportsService } from './chat-reports.service';

const createdAt = new Date('2026-08-22T10:00:00.000Z');

/**
 * Заглушка Prisma без заранее навязанного типа результата: строгий
 * TypeScript иначе выводит тип по первой реализации, и следующий
 * mockResolvedValue в тесте перестаёт компилироваться.
 */
function fn(impl?: (...args: never[]) => unknown): jest.Mock {
  return jest.fn(impl as never);
}

function message(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    authorId: 'a',
    body: 'привет',
    createdAt,
    editedAt: null,
    deletedAt: null,
    author: { name: 'Кешава' },
    _count: { attachments: 0 },
    ...over,
  };
}

describe('ChatReportsService', () => {
  const prisma = {
    chatConversation: { findUnique: fn() },
    chatReport: { findFirst: fn(() => Promise.resolve(null)) },
    chatMessage: { findMany: fn(() => Promise.resolve([])) },
  };
  const bus = { emit: fn() };
  const moderation = { hasOpenReportBetween: fn(() => Promise.resolve(false)) };

  const service = new ChatReportsService(
    prisma as unknown as PrismaService,
    bus as never,
    moderation as unknown as ModerationService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    moderation.hasOpenReportBetween.mockResolvedValue(false);
    prisma.chatReport.findFirst.mockResolvedValue(null);
    prisma.chatConversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
    });
    prisma.chatMessage.findMany.mockResolvedValue([message('message-1')]);
  });

  describe('adminDirectTranscript', () => {
    it('без жалобы переписку не отдаёт', async () => {
      await expect(
        service.adminDirectTranscript('admin', 'a', 'b'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.chatMessage.findMany).not.toHaveBeenCalled();
    });

    it('и беседу не ищет: иначе перебором пар видно, кто с кем говорил', async () => {
      await expect(
        service.adminDirectTranscript('admin', 'a', 'b'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.chatConversation.findUnique).not.toHaveBeenCalled();
    });

    it('портальная жалоба на человека открывает переписку', async () => {
      moderation.hasOpenReportBetween.mockResolvedValue(true);

      const result = await service.adminDirectTranscript('admin', 'a', 'b');

      expect(result.conversationId).toBe('conversation-1');
      expect(result.messages).toHaveLength(1);
      expect(result.truncated).toBe(false);
    });

    it('просмотр пишется в журнал событием, которое журнал принимает', async () => {
      moderation.hasOpenReportBetween.mockResolvedValue(true);

      await service.adminDirectTranscript('admin', 'a', 'b');

      // Раньше сюда уезжал литерал без targetType и с действием, которого нет
      // в списке журнала: запись молча не создавалась, а администратору
      // обещано обратное.
      const [name, event] = bus.emit.mock.calls[0] as [string, AdminAuditEvent];
      expect(name).toBe('admin.action');
      expect(ADMIN_AUDIT_ACTIONS).toContain(event.action);
      expect(event.targetType).toBe('user');
      expect(event.targetId).toBe('b');
      expect(event.details?.basis).toBe('portal-report');
    });

    it('в журнале видно, какая именно жалоба стала основанием', async () => {
      prisma.chatReport.findFirst.mockResolvedValue({ id: 'report-1' });

      await service.adminDirectTranscript('admin', 'a', 'b');

      const [, event] = bus.emit.mock.calls[0] as [string, AdminAuditEvent];
      expect(event.details?.basis).toBe('chat-report');
    });

    it('отдаёт последние сообщения и признаётся, что показал не все', async () => {
      moderation.hasOpenReportBetween.mockResolvedValue(true);
      // Предел 500: сервис берёт на одну строку больше, чтобы отличить
      // «ровно предел» от «есть ещё». База отдаёт по убыванию времени, то
      // есть свежие первыми, — заглушка повторяет этот порядок.
      prisma.chatMessage.findMany.mockResolvedValue(
        Array.from({ length: 501 }, (_, index) => message(`m${500 - index}`)),
      );

      const result = await service.adminDirectTranscript('admin', 'a', 'b');

      expect(result.truncated).toBe(true);
      expect(result.messages).toHaveLength(500);

      const [query] = prisma.chatMessage.findMany.mock.calls[0] as [
        { orderBy: { createdAt: string }; take: number },
      ];
      // Свежие, а не первые: иначе обрезается ровно то, на что жалуются.
      expect(query.orderBy.createdAt).toBe('desc');
      expect(query.take).toBe(501);
      // Наружу — по возрастанию времени, как читают переписку. Лишним
      // оказывается самое старое сообщение, а не самое свежее.
      expect(result.messages[0].id).toBe('m1');
      expect(result.messages[499].id).toBe('m500');
    });

    it('текст удалённого сообщения доходит до разбора жалобы', async () => {
      moderation.hasOpenReportBetween.mockResolvedValue(true);
      prisma.chatMessage.findMany.mockResolvedValue([
        message('message-1', {
          body: 'оскорбление',
          deletedAt: new Date('2026-08-29T10:00:00.000Z'),
        }),
      ]);

      const result = await service.adminDirectTranscript('admin', 'a', 'b');

      // Типовая травля — написать и стереть: без стёртого разбирать нечего.
      expect(result.messages[0].body).toBe('оскорбление');
      expect(result.messages[0].deletedAt).toBe('2026-08-29T10:00:00.000Z');
    });

    it('своя жалоба на беседу тоже повод: портальной может не быть', async () => {
      prisma.chatReport.findFirst.mockResolvedValue({ id: 'report-1' });

      const result = await service.adminDirectTranscript('admin', 'a', 'b');

      expect(result.messages).toHaveLength(1);
      const [query] = prisma.chatReport.findFirst.mock.calls[0] as [
        { where: { status: string } },
      ];
      // Разобранная жалоба повода не даёт: смотреть снова — через возврат
      // её в работу.
      expect(query.where.status).toBe('open');
    });

    it('повод есть, а переписки нет — пустая выдача, а не отказ', async () => {
      moderation.hasOpenReportBetween.mockResolvedValue(true);
      prisma.chatConversation.findUnique.mockResolvedValue(null);

      await expect(
        service.adminDirectTranscript('admin', 'a', 'b'),
      ).resolves.toEqual({
        conversationId: null,
        messages: [],
        truncated: false,
      });
    });
  });
});
