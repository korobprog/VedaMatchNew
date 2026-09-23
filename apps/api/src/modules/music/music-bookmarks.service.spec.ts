import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { MusicBookmarksService } from './music-bookmarks.service';

const createdAt = new Date('2026-09-24T09:00:00.000Z');

function prismaMock() {
  return {
    musicTrack: {
      findUnique: jest.fn().mockResolvedValue({
        id: 't1',
        durationSeconds: 600,
        status: 'published',
        uploadedById: null,
      }),
    },
    musicBookmark: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ id: 'b1', createdAt, ...data }),
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

const service = (p: ReturnType<typeof prismaMock>) =>
  new MusicBookmarksService(p as unknown as PrismaService);

describe('MusicBookmarksService.create', () => {
  it('ставит метку на место в записи с подписью', async () => {
    const prisma = prismaMock();

    const result = await service(prisma).create('u1', {
      trackId: 't1',
      positionSeconds: 754.6,
      label: '  стих  2.13 ',
    });

    expect(prisma.musicBookmark.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: 'u1',
          trackId: 't1',
          // Позиция за концом записи зажимается длительностью.
          positionSeconds: 600,
          label: 'стих 2.13',
        },
      }),
    );
    expect(result).toEqual({
      id: 'b1',
      trackId: 't1',
      positionSeconds: 600,
      label: 'стих 2.13',
      createdAt: createdAt.toISOString(),
    });
  });

  it('подпись необязательна', async () => {
    const prisma = prismaMock();

    await service(prisma).create('u1', { trackId: 't1', positionSeconds: 12 });

    expect(prisma.musicBookmark.create.mock.calls[0][0].data.label).toBeNull();
  });

  it('без места в записи — отказ', async () => {
    const prisma = prismaMock();

    await expect(
      service(prisma).create('u1', {
        trackId: 't1',
        positionSeconds: 'abc' as never,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.musicBookmark.create).not.toHaveBeenCalled();
  });

  it('чужой черновик — 404, как и несуществующая запись', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findUnique.mockResolvedValue({
      id: 't1',
      durationSeconds: 600,
      status: 'draft',
      uploadedById: 'someone-else',
    });

    await expect(
      service(prisma).create('u1', { trackId: 't1', positionSeconds: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('потолок меток на запись', async () => {
    const prisma = prismaMock();
    prisma.musicBookmark.count.mockResolvedValue(200);

    await expect(
      service(prisma).create('u1', { trackId: 't1', positionSeconds: 1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('MusicBookmarksService.list', () => {
  it('только свои метки этой записи, по порядку в записи', async () => {
    const prisma = prismaMock();
    prisma.musicBookmark.findMany.mockResolvedValue([
      { id: 'b1', trackId: 't1', positionSeconds: 30, label: null, createdAt },
    ]);

    const { items } = await service(prisma).list('u1', 't1');

    expect(prisma.musicBookmark.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', trackId: 't1' },
        orderBy: [{ positionSeconds: 'asc' }, { createdAt: 'asc' }],
      }),
    );
    expect(items).toHaveLength(1);
  });

  it('без записи в запросе — 404, а не все метки подряд', async () => {
    const prisma = prismaMock();

    await expect(service(prisma).list('u1', undefined)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.musicBookmark.findMany).not.toHaveBeenCalled();
  });
});

describe('MusicBookmarksService.update / remove', () => {
  it('подпись правит только у своей метки', async () => {
    const prisma = prismaMock();
    prisma.musicBookmark.findUnique.mockResolvedValue({
      id: 'b1',
      trackId: 't1',
      positionSeconds: 30,
      label: 'припев',
      createdAt,
    });

    const result = await service(prisma).update('u1', 'b1', {
      label: 'припев',
    });

    expect(prisma.musicBookmark.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', userId: 'u1' },
      data: { label: 'припев' },
    });
    expect(result.label).toBe('припев');
  });

  it('чужая метка — 404', async () => {
    const prisma = prismaMock();
    prisma.musicBookmark.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service(prisma).update('u1', 'b1', { label: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('удаление — только своей и без ошибки на повтор', async () => {
    const prisma = prismaMock();
    prisma.musicBookmark.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service(prisma).remove('u1', 'b1')).resolves.toEqual({
      ok: true,
    });
    expect(prisma.musicBookmark.deleteMany).toHaveBeenCalledWith({
      where: { id: 'b1', userId: 'u1' },
    });
  });
});
