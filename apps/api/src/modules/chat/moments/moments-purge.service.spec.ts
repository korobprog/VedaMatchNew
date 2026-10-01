import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ChatUploadsService } from '../chat-uploads.service';
import { ChatMomentsPurger } from './moments-purge.service';

function fn(impl?: (...args: never[]) => unknown): jest.Mock {
  return jest.fn(impl as never);
}

describe('ChatMomentsPurger', () => {
  const prisma = {
    chatMoment: {
      findMany: fn(() => Promise.resolve([])),
      deleteMany: fn(),
    },
    chatAttachment: { findMany: fn(() => Promise.resolve([])) },
  };
  const uploads = { removeMany: fn() };
  const config = { get: fn(() => undefined) };

  const purger = new ChatMomentsPurger(
    prisma as unknown as PrismaService,
    uploads as unknown as ChatUploadsService,
    config as unknown as ConfigService,
  );

  const now = new Date('2026-09-20T12:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.chatMoment.findMany.mockResolvedValue([]);
    prisma.chatAttachment.findMany.mockResolvedValue([]);
  });

  it('без сгоревшего ничего не трогает', async () => {
    await expect(purger.purgeExpired(now)).resolves.toBe(0);
    expect(prisma.chatMoment.deleteMany).not.toHaveBeenCalled();
    expect(uploads.removeMany).not.toHaveBeenCalled();
  });

  it('берёт сгоревшее раньше отсрочки и не трогает то, на что открыта жалоба', async () => {
    await purger.purgeExpired(now);

    const [query] = prisma.chatMoment.findMany.mock.calls[0] as [
      { where: { expiresAt: { lt: Date }; reports: unknown } },
    ];
    // Неделя по умолчанию.
    expect(query.where.expiresAt.lt.toISOString()).toBe(
      '2026-09-13T12:00:00.000Z',
    );
    expect(query.where.reports).toEqual({ none: { status: 'open' } });
  });

  it('файл, уехавший снимком в переписку, остаётся в бакете', async () => {
    prisma.chatMoment.findMany.mockResolvedValue([
      { id: 'm1', key: 'chat/moments/u1/a.webp' },
      { id: 'm2', key: 'chat/moments/u1/b.webp' },
    ]);
    // На первый ключ ссылается ответ на момент — его удалять нельзя.
    prisma.chatAttachment.findMany.mockResolvedValue([
      { key: 'chat/moments/u1/a.webp' },
    ]);

    await expect(purger.purgeExpired(now)).resolves.toBe(2);
    expect(uploads.removeMany).toHaveBeenCalledWith(['chat/moments/u1/b.webp']);
  });

  it('момент без файла чистку не ломает', async () => {
    prisma.chatMoment.findMany.mockResolvedValue([{ id: 'm1', key: null }]);
    await expect(purger.purgeExpired(now)).resolves.toBe(1);
    expect(uploads.removeMany).toHaveBeenCalledWith([]);
  });
});
