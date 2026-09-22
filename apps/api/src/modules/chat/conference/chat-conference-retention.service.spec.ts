import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { ChatConferenceRetentionService } from './chat-conference-retention.service';

/**
 * Заглушка Prisma без заранее навязанного типа результата: строгий
 * TypeScript иначе выводит тип по первой реализации, и следующий
 * `mockResolvedValue` перестаёт компилироваться.
 */
function fn(impl?: (...args: never[]) => unknown): jest.Mock {
  return jest.fn(impl as never);
}

const DAY = 24 * 60 * 60 * 1000;

describe('ChatConferenceRetentionService', () => {
  const prisma = {
    chatConferenceLink: { findMany: fn(() => Promise.resolve([])) },
    chatConversation: { delete: fn(() => Promise.resolve({})) },
  };
  // Без REDIS_HOST лиз не берётся: один инстанс убирает сам.
  const config = { get: fn(() => undefined) };

  const service = new ChatConferenceRetentionService(
    prisma as unknown as PrismaService,
    config as unknown as ConfigService,
  );

  const now = new Date();
  const days = (n: number) => new Date(now.getTime() + n * DAY);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.chatConferenceLink.findMany.mockResolvedValue([]);
  });

  it('без накопленного ничего не удаляет', async () => {
    await expect(service.tick(now)).resolves.toBe(0);
    expect(prisma.chatConversation.delete).not.toHaveBeenCalled();
  });

  it('спрашивает только пустые комнаты с закрытой дверью', async () => {
    await service.tick(now);

    const [query] = prisma.chatConferenceLink.findMany.mock.calls[0] as [
      {
        where: {
          OR: { expiresAt?: { lt: Date }; revokedAt?: { lt: Date } }[];
          conversation: unknown;
        };
        take: number;
      },
    ];
    // Неделя по умолчанию — граница ровно на семь суток назад.
    const cutoff = query.where.OR[0].expiresAt?.lt as Date;
    expect(cutoff.getTime()).toBe(now.getTime() - 7 * DAY);
    // min(revokedAt, expiresAt) < cutoff — обе ветки обязаны быть в запросе,
    // иначе отозванная вчера, но давно просроченная ссылка либо потеряется,
    // либо, наоборот, уберётся раньше срока.
    expect(query.where.OR[1].revokedAt?.lt).toEqual(cutoff);
    // Главное условие: ни одного сообщения. Без него уборка стирает разговор.
    expect(query.where.conversation).toEqual({ messages: { none: {} } });
    expect(query.take).toBe(200);
  });

  it('удаляет беседу целиком, а не одну лишь ссылку', async () => {
    prisma.chatConferenceLink.findMany.mockResolvedValue([
      {
        id: 'l1',
        conversationId: 'c1',
        expiresAt: days(-30),
        revokedAt: null,
      },
    ]);

    await expect(service.tick(now)).resolves.toBe(1);
    expect(prisma.chatConversation.delete).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
  });

  it('не трогает комнату, чей срок ещё не вышел, даже если её вернул запрос', async () => {
    // Такое бывает при рассинхроне часов инстансов: приговор выносит
    // чистая функция по тем же данным, а не сам запрос.
    prisma.chatConferenceLink.findMany.mockResolvedValue([
      {
        id: 'l1',
        conversationId: 'c1',
        expiresAt: days(-1),
        revokedAt: null,
      },
    ]);

    await expect(service.tick(now)).resolves.toBe(0);
    expect(prisma.chatConversation.delete).not.toHaveBeenCalled();
  });

  it('не трогает комнату с работающей ссылкой', async () => {
    prisma.chatConferenceLink.findMany.mockResolvedValue([
      { id: 'l1', conversationId: 'c1', expiresAt: days(3), revokedAt: null },
    ]);

    await expect(service.tick(now)).resolves.toBe(0);
    expect(prisma.chatConversation.delete).not.toHaveBeenCalled();
  });

  it('отзыв задним числом не продлевает жизнь комнаты', async () => {
    // Дверь закрылась, когда вышел срок; нажатое позже «закрыть вход»
    // ничего не открывало и отсчёт не двигает.
    prisma.chatConferenceLink.findMany.mockResolvedValue([
      {
        id: 'l1',
        conversationId: 'просроченная',
        expiresAt: days(-20),
        revokedAt: null,
      },
      {
        id: 'l2',
        conversationId: 'отозванная-потом',
        expiresAt: days(-20),
        revokedAt: days(-1),
      },
    ]);

    await expect(service.tick(now)).resolves.toBe(2);
    expect(prisma.chatConversation.delete).toHaveBeenCalledTimes(2);
  });

  it('свежий отзыв даёт комнате ту же неделю, что и истёкший срок', async () => {
    prisma.chatConferenceLink.findMany.mockResolvedValue([
      {
        id: 'l1',
        conversationId: 'вчерашняя',
        expiresAt: days(-0.5),
        revokedAt: days(-1),
      },
    ]);

    await expect(service.tick(now)).resolves.toBe(0);
    expect(prisma.chatConversation.delete).not.toHaveBeenCalled();
  });

  it('срок берётся из настройки', async () => {
    const tuned = new ChatConferenceRetentionService(
      prisma as unknown as PrismaService,
      {
        get: fn((key: never) =>
          key === 'CHAT_CONFERENCE_EMPTY_DAYS' ? '30' : undefined,
        ),
      } as unknown as ConfigService,
    );
    await tuned.tick(now);

    const [query] = prisma.chatConferenceLink.findMany.mock.calls[0] as [
      { where: { OR: { expiresAt?: { lt: Date } }[] } },
    ];
    expect((query.where.OR[0].expiresAt?.lt as Date).getTime()).toBe(
      now.getTime() - 30 * DAY,
    );
  });

  it('падение запроса не роняет тик', async () => {
    prisma.chatConferenceLink.findMany.mockRejectedValue(new Error('база'));
    await expect(service.tick(now)).resolves.toBe(0);
  });

  it('второй тик поверх идущего не запускается', async () => {
    let release: (() => void) | undefined;
    prisma.chatConferenceLink.findMany.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve([]);
      }),
    );
    const first = service.tick(now);
    await expect(service.tick(now)).resolves.toBe(0);
    release?.();
    await first;
    expect(prisma.chatConferenceLink.findMany).toHaveBeenCalledTimes(1);
  });
});
