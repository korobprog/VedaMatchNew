import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../prisma/prisma.service';
import { PortalAccessService } from '../access/access.service';
import { MusicCoversService } from './music-covers.service';
import { MusicPlaylistsService } from './music-playlists.service';
import { MusicStorageService } from './music-storage.service';

const config = { get: () => undefined } as unknown as ConfigService;

const playlistRow = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  ownerId: 'u1',
  title: 'Утренний киртан',
  description: null,
  coverKey: null,
  visibility: 'private',
  trackCount: 1,
  isSystem: false,
  updatedAt: new Date('2026-08-29T00:00:00.000Z'),
  ...over,
});

const trackRow = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  title: 'Джая Радха-Мадхава',
  storageKey: 'music/uploads/u1/a.mp3',
  durationSeconds: 198,
  bitrateKbps: 192,
  coverKey: null,
  status: 'published',
  language: null,
  isLiveRecording: false,
  playCount: 0,
  publishedAt: new Date('2026-08-28T00:00:00.000Z'),
  artist: null,
  album: null,
  categories: [],
  ...over,
});

function prismaMock() {
  return {
    musicPlaylist: {
      findUnique: jest.fn().mockResolvedValue(playlistRow()),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue(playlistRow()),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue(playlistRow()),
      delete: jest.fn().mockResolvedValue({}),
    },
    musicPlaylistItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    musicSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    // Портальный граф доступа: `null` — доступ не открыт.
    activityFollow: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest
      .fn()
      .mockImplementation((ops: unknown[]) => Promise.all(ops)),
  };
}

const covers = () =>
  new MusicCoversService(
    new MusicStorageService({ get: () => undefined } as unknown as ConfigService),
  );

/**
 * Портальный граф доступа настоящим сервисом поверх того же мока Prisma:
 * подменять его заглушкой значило бы проверять видимость «для друзей» не тем
 * кодом, который отвечает на этот вопрос в проде.
 */
const service = (p: ReturnType<typeof prismaMock>) =>
  new MusicPlaylistsService(
    p as unknown as PrismaService,
    { emit: jest.fn() } as unknown as EventEmitter2,
    covers(),
    new PortalAccessService(p as unknown as PrismaService),
    config,
  );

describe('MusicPlaylistsService.getOne', () => {
  it('владельцу отдаёт его плейлист', async () => {
    const prisma = prismaMock();
    prisma.musicPlaylistItem.findMany.mockResolvedValue([
      { track: trackRow() },
    ]);

    const page = await service(prisma).getOne('u1', 'p1');

    expect(page.playlist.id).toBe('p1');
    expect(page.tracks).toHaveLength(1);
    expect(page.canEdit).toBe(true);
  });

  // 404, а не 403: иначе по коду ответа перебираются чужие плейлисты.
  it('чужой закрытый — не найден', async () => {
    const prisma = prismaMock();

    await expect(service(prisma).getOne('u2', 'p1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('публичный открыт кому угодно, но править его нельзя', async () => {
    const prisma = prismaMock();
    prisma.musicPlaylist.findUnique.mockResolvedValue(
      playlistRow({ visibility: 'public' }),
    );

    const page = await service(prisma).getOne('u2', 'p1');

    expect(page.playlist.id).toBe('p1');
    expect(page.canEdit).toBe(false);
  });

  describe('видимость «для друзей»', () => {
    const friendsRow = () => playlistRow({ visibility: 'friends' });

    it('открывается тому, кому владелец открыл активность', async () => {
      const prisma = prismaMock();
      prisma.musicPlaylist.findUnique.mockResolvedValue(friendsRow());
      prisma.activityFollow.findFirst.mockResolvedValue({ granterId: 'u1' });

      const page = await service(prisma).getOne('u2', 'p1');

      expect(page.playlist.id).toBe('p1');
      expect(page.canEdit).toBe(false);
    });

    // Спрашиваем именно про пару «владелец → зритель», а не наоборот: доступ
    // односторонний, и перепутанные местами идентификаторы открыли бы чужое.
    it('спрашивает граф про владельца и зрителя в правильном порядке', async () => {
      const prisma = prismaMock();
      prisma.musicPlaylist.findUnique.mockResolvedValue(friendsRow());
      prisma.activityFollow.findFirst.mockResolvedValue({ granterId: 'u1' });

      await service(prisma).getOne('u2', 'p1');

      expect(prisma.activityFollow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { granterId: 'u1', granteeId: 'u2', revokedAt: null },
        }),
      );
    });

    it('постороннему не открывается', async () => {
      const prisma = prismaMock();
      prisma.musicPlaylist.findUnique.mockResolvedValue(friendsRow());

      await expect(service(prisma).getOne('u2', 'p1')).rejects.toThrow(
        NotFoundException,
      );
    });

    // Доступ отозвали — плейлист закрывается вместе с лентой.
    it('после отзыва доступа закрывается', async () => {
      const prisma = prismaMock();
      prisma.musicPlaylist.findUnique.mockResolvedValue(friendsRow());
      prisma.activityFollow.findFirst.mockResolvedValue(null);

      await expect(service(prisma).getOne('u2', 'p1')).rejects.toThrow(
        NotFoundException,
      );
    });

    // Подборка портала осталась без автора: спрашивать графу не о ком.
    it('без владельца в граф не ходит', async () => {
      const prisma = prismaMock();
      prisma.musicPlaylist.findUnique.mockResolvedValue(
        playlistRow({ visibility: 'friends', ownerId: null }),
      );

      await expect(service(prisma).getOne('u2', 'p1')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.activityFollow.findFirst).not.toHaveBeenCalled();
    });
  });

  it('подборку портала видят все и не правит никто', async () => {
    const prisma = prismaMock();
    prisma.musicPlaylist.findUnique.mockResolvedValue(
      playlistRow({ isSystem: true, ownerId: 'редакция' }),
    );

    const page = await service(prisma).getOne('u2', 'p1');

    expect(page.canEdit).toBe(false);
  });

  // Владелец мог сложить в плейлист свои записи, ещё не прошедшие модерацию.
  it('чужому не показывает неопубликованные записи', async () => {
    const prisma = prismaMock();
    prisma.musicPlaylist.findUnique.mockResolvedValue(
      playlistRow({ visibility: 'public' }),
    );
    prisma.musicPlaylistItem.findMany.mockResolvedValue([
      { track: trackRow() },
      { track: trackRow({ id: 't2', status: 'pending' }) },
    ]);

    const page = await service(prisma).getOne('u2', 'p1');

    expect(page.tracks.map((track) => track.id)).toEqual(['t1']);
  });

  it('владельцу показывает и неопубликованные', async () => {
    const prisma = prismaMock();
    prisma.musicPlaylistItem.findMany.mockResolvedValue([
      { track: trackRow() },
      { track: trackRow({ id: 't2', status: 'pending' }) },
    ]);

    const page = await service(prisma).getOne('u1', 'p1');

    expect(page.tracks).toHaveLength(2);
  });

  it('несуществующего плейлиста нет', async () => {
    const prisma = prismaMock();
    prisma.musicPlaylist.findUnique.mockResolvedValue(null);

    await expect(service(prisma).getOne('u1', 'нет')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('MusicPlaylistsService.moveTrack', () => {
  const items = [
    { id: 'i1', trackId: 't1', position: 1000 },
    { id: 'i2', trackId: 't2', position: 2000 },
    { id: 'i3', trackId: 't3', position: 3000 },
  ];

  it('вставка в середину — одна строка, между соседями', async () => {
    const prisma = prismaMock();
    prisma.musicPlaylistItem.findMany.mockResolvedValue(items);

    await service(prisma).moveTrack('u1', 'p1', 't3', 1);

    expect(prisma.musicPlaylistItem.update).toHaveBeenCalledTimes(1);
    expect(prisma.musicPlaylistItem.update).toHaveBeenCalledWith({
      where: { id: 'i3' },
      data: { position: 1500 },
    });
  });

  /**
   * Запись, переезжающая вниз, освобождает своё место: без поправки на
   * `fromIndex` она встала бы на позицию выше показанной человеком.
   */
  it('переезд в конец встаёт за последним', async () => {
    const prisma = prismaMock();
    prisma.musicPlaylistItem.findMany.mockResolvedValue(items);

    await service(prisma).moveTrack('u1', 'p1', 't1', 2);

    expect(prisma.musicPlaylistItem.update).toHaveBeenCalledWith({
      where: { id: 'i1' },
      data: { position: 4000 },
    });
  });

  // Зазор между соседями кончился: список раздвигается целиком, и перенос
  // считается заново. Редкий случай, а не каждое перетаскивание.
  it('на исчерпанном зазоре перенумеровывает и повторяет', async () => {
    const prisma = prismaMock();
    prisma.musicPlaylistItem.findMany.mockResolvedValue([
      { id: 'i1', trackId: 't1', position: 1 },
      { id: 'i2', trackId: 't2', position: 2 },
      { id: 'i3', trackId: 't3', position: 3 },
    ]);

    await service(prisma).moveTrack('u1', 'p1', 't3', 1);

    expect(prisma.$transaction).toHaveBeenCalled();
    // Три на перенумерацию плюс одна на сам перенос.
    expect(prisma.musicPlaylistItem.update).toHaveBeenCalledTimes(4);
  });

  it('записи не в плейлисте нет', async () => {
    const prisma = prismaMock();
    prisma.musicPlaylistItem.findMany.mockResolvedValue(items);

    await expect(
      service(prisma).moveTrack('u1', 'p1', 'чужая', 0),
    ).rejects.toThrow(NotFoundException);
  });

  it('чужой плейлист не переставляется', async () => {
    const prisma = prismaMock();

    await expect(service(prisma).moveTrack('u2', 'p1', 't1', 0)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('подборку портала не переставляет и владелец', async () => {
    const prisma = prismaMock();
    prisma.musicPlaylist.findUnique.mockResolvedValue(
      playlistRow({ isSystem: true }),
    );

    await expect(service(prisma).moveTrack('u1', 'p1', 't1', 0)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
