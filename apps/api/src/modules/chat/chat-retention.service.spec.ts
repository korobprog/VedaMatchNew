import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ChatRetentionService } from './chat-retention.service';
import type { ChatUploadsService } from './chat-uploads.service';
import type { ChatMomentsPurger } from './moments/moments-purge.service';

/**
 * Заглушка Prisma без заранее навязанного типа результата: строгий
 * TypeScript иначе выводит тип по первой реализации, и следующий
 * mockResolvedValue в тесте перестаёт компилироваться.
 */
function fn(impl?: (...args: never[]) => unknown): jest.Mock {
  return jest.fn(impl as never);
}

describe('ChatRetentionService', () => {
  const prisma = {
    chatMessage: {
      findMany: fn(() => Promise.resolve([])),
      updateMany: fn(),
    },
    chatAttachment: {
      findMany: fn(() => Promise.resolve([])),
      deleteMany: fn(),
    },
    chatMessageReaction: { deleteMany: fn() },
  };
  const uploads = { removeMany: fn() };
  // Без REDIS_HOST лиз не берётся: один инстанс чистит сам, как и воркер
  // Мотивации в локальной разработке.
  const config = { get: fn(() => undefined) };
  const moments = { graceDays: 7, purgeExpired: fn(() => Promise.resolve(0)) };

  const service = new ChatRetentionService(
    prisma as unknown as PrismaService,
    uploads as unknown as ChatUploadsService,
    moments as unknown as ChatMomentsPurger,
    config as unknown as ConfigService,
  );

  const now = new Date('2026-08-30T12:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.chatMessage.findMany.mockResolvedValue([]);
    prisma.chatAttachment.findMany.mockResolvedValue([]);
    moments.purgeExpired.mockResolvedValue(0);
  });

  it('без накопленного ничего не трогает', async () => {
    await expect(service.tick(now)).resolves.toBe(0);
    expect(prisma.chatMessage.updateMany).not.toHaveBeenCalled();
    expect(uploads.removeMany).not.toHaveBeenCalled();
  });

  it('берёт только удалённое раньше границы и ещё не вычищенное', async () => {
    await service.tick(now);

    const [query] = prisma.chatMessage.findMany.mock.calls[0] as [
      { where: { deletedAt: { lt: Date }; OR: unknown[] } },
    ];
    // Тридцать дней по умолчанию.
    expect(query.where.deletedAt.lt.toISOString()).toBe(
      '2026-07-31T12:00:00.000Z',
    );
    // Иначе каждый тик перебирал бы всю историю удалений заново.
    expect(query.where.OR).toEqual([
      { body: { not: '' } },
      { attachments: { some: {} } },
    ]);
  });

  it('стирает текст, вложения и реакции, а строку оставляет', async () => {
    prisma.chatMessage.findMany.mockResolvedValue([
      { id: 'message-1', attachments: [{ key: 'chat/c1/a.webp' }] },
    ]);

    await expect(service.tick(now)).resolves.toBe(1);

    expect(prisma.chatMessage.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['message-1'] } },
      data: { body: '' },
    });
    expect(prisma.chatAttachment.deleteMany).toHaveBeenCalledWith({
      where: { messageId: { in: ['message-1'] } },
    });
    expect(prisma.chatMessageReaction.deleteMany).toHaveBeenCalledWith({
      where: { messageId: { in: ['message-1'] } },
    });
    expect(uploads.removeMany).toHaveBeenCalledWith(['chat/c1/a.webp']);
  });

  it('не удаляет файл, на который ссылается пересланная копия', async () => {
    prisma.chatMessage.findMany.mockResolvedValue([
      {
        id: 'message-1',
        attachments: [{ key: 'chat/c1/a.webp' }, { key: 'chat/c1/b.pdf' }],
      },
    ]);
    // Ту же картинку переслали в другую беседу: объект в бакете один.
    prisma.chatAttachment.findMany.mockResolvedValue([
      { key: 'chat/c1/a.webp' },
    ]);

    await service.tick(now);

    expect(uploads.removeMany).toHaveBeenCalledWith(['chat/c1/b.pdf']);
  });

  it('сбой не оставляет чистку заблокированной навсегда', async () => {
    prisma.chatMessage.findMany.mockRejectedValue(new Error('db'));

    await expect(service.tick(now)).resolves.toBe(0);

    // Следующий тик должен снова дойти до базы, а не упереться в running.
    prisma.chatMessage.findMany.mockResolvedValue([]);
    await expect(service.tick(now)).resolves.toBe(0);
    expect(prisma.chatMessage.findMany).toHaveBeenCalledTimes(2);
  });

  it('в тот же тик убирает сгоревшие моменты', async () => {
    moments.purgeExpired.mockResolvedValue(3);
    await expect(service.tick(now)).resolves.toBe(3);
    expect(moments.purgeExpired).toHaveBeenCalledWith(now);
  });

  it('падение одной чистки не отменяет вторую', async () => {
    prisma.chatMessage.findMany.mockRejectedValue(new Error('база молчит'));
    moments.purgeExpired.mockResolvedValue(2);
    // Сообщения не вычистились, моменты — да; тик не падает.
    await expect(service.tick(now)).resolves.toBe(2);
    expect(moments.purgeExpired).toHaveBeenCalled();
  });
});
