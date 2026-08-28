import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import { MusicFavoritesService } from './music-favorites.service';

const config = { get: jest.fn(() => undefined) } as unknown as ConfigService;

function prismaMock() {
  return {
    musicTrack: {
      findUnique: jest.fn().mockResolvedValue({
        id: 't1',
        title: 'Шри Гуру-вандана',
        status: 'published',
        uploadedById: null,
      }),
    },
    musicFavorite: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    musicSettings: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
}

function busMock() {
  return { emit: jest.fn() };
}

const service = (
  p: ReturnType<typeof prismaMock>,
  bus: ReturnType<typeof busMock> = busMock(),
) =>
  new MusicFavoritesService(
    p as unknown as PrismaService,
    bus as unknown as EventEmitter2,
    config,
  );

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

describe('MusicFavoritesService.add — событие для ленты друзей', () => {
  it('сообщает о первом нажатии, с названием и ссылкой', async () => {
    const prisma = prismaMock();
    const bus = busMock();

    await service(prisma, bus).add('u1', 't1');

    expect(bus.emit).toHaveBeenCalledWith(
      'music.user.activity',
      expect.objectContaining({
        userId: 'u1',
        action: 'music.track-favorited',
        entityId: 't1',
        entityLabel: 'Шри Гуру-вандана',
        link: '/music/tracks/t1',
      }),
    );
  });

  // Сердце жмут дважды: второй раз — исправление промаха, а не новое
  // действие, и лента не должна показывать его друзьям ещё раз.
  it('молчит, когда запись уже была в избранном', async () => {
    const prisma = prismaMock();
    prisma.musicFavorite.findUnique.mockResolvedValue({ trackId: 't1' });
    const bus = busMock();

    await service(prisma, bus).add('u1', 't1');

    expect(bus.emit).not.toHaveBeenCalled();
  });

  it('молчит, когда человек выключил видимость', async () => {
    const prisma = prismaMock();
    prisma.musicSettings.findUnique.mockResolvedValue({
      nowPlayingVisibility: 'nobody',
    });
    const bus = busMock();

    await service(prisma, bus).add('u1', 't1');

    expect(bus.emit).not.toHaveBeenCalled();
  });
});
