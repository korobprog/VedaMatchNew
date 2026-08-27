import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import { MusicFavoritesService } from './music-favorites.service';

const config = { get: jest.fn(() => undefined) } as unknown as ConfigService;

function prismaMock() {
  return {
    musicTrack: {
      findUnique: jest.fn().mockResolvedValue({
        id: 't1',
        status: 'published',
        uploadedById: null,
      }),
    },
    musicFavorite: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

const service = (p: ReturnType<typeof prismaMock>) =>
  new MusicFavoritesService(p as unknown as PrismaService, config);

describe('MusicFavoritesService.add', () => {
  it('добавляет запись в избранное', async () => {
    const prisma = prismaMock();

    await service(prisma).add('u1', 't1');

    expect(prisma.musicFavorite.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_trackId: { userId: 'u1', trackId: 't1' } },
      }),
    );
  });

  it('повторное добавление не падает — сердце нажимают дважды', async () => {
    const prisma = prismaMock();

    await service(prisma).add('u1', 't1');
    await expect(service(prisma).add('u1', 't1')).resolves.toEqual({
      favorited: true,
    });
  });

  it('чужую неопубликованную в избранное не положить', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findUnique.mockResolvedValue({
      id: 't1',
      status: 'pending',
      uploadedById: 'кто-то другой',
    });

    await expect(service(prisma).add('u1', 't1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.musicFavorite.upsert).not.toHaveBeenCalled();
  });

  it('свою неопубликованную — можно', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findUnique.mockResolvedValue({
      id: 't1',
      status: 'pending',
      uploadedById: 'u1',
    });

    await expect(service(prisma).add('u1', 't1')).resolves.toEqual({
      favorited: true,
    });
  });

  it('несуществующей записи нет', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findUnique.mockResolvedValue(null);

    await expect(service(prisma).add('u1', 'нет')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('MusicFavoritesService.remove', () => {
  it('убирает из избранного', async () => {
    const prisma = prismaMock();

    await expect(service(prisma).remove('u1', 't1')).resolves.toEqual({
      favorited: false,
    });
    expect(prisma.musicFavorite.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', trackId: 't1' },
    });
  });

  it('снятие того, чего не было, не падает', async () => {
    // Двойной клик по сердцу не должен показывать человеку ошибку.
    const prisma = prismaMock();
    prisma.musicFavorite.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service(prisma).remove('u1', 't1')).resolves.toEqual({
      favorited: false,
    });
  });

  it('снятие не проверяет запись: её могли уже удалить из каталога', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findUnique.mockResolvedValue(null);

    await expect(service(prisma).remove('u1', 't1')).resolves.toEqual({
      favorited: false,
    });
  });
});

describe('MusicFavoritesService.list', () => {
  it('отдаёт свежие первыми', async () => {
    const prisma = prismaMock();

    await service(prisma).list('u1');

    expect(prisma.musicFavorite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'u1' }),
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('снятую с витрины запись в избранном не показывает', async () => {
    // Сердце остаётся нажатым, но играть нечего: скрытую по жалобе запись
    // нельзя отдавать через избранное в обход каталога.
    const prisma = prismaMock();

    await service(prisma).list('u1');

    const where = prisma.musicFavorite.findMany.mock.calls[0][0].where;
    expect(where.track).toEqual({ status: 'published' });
  });
});
