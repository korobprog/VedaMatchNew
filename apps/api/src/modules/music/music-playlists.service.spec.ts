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
    activityFollow: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
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

describe('MusicPlaylistsService.listFriendPlaylists', () => {
  const friendRow = (over = {}) => ({
    id: 'p-friend',
    title: 'Утренний киртан',
    description: null,
    coverKey: null,
    visibility: 'friends',
    trackCount: 3,
    isSystem: false,
    updatedAt: new Date('2026-08-29T00:00:00Z'),
    owner: {
      id: 'friend-1',
      name: 'Мирское имя',
      spiritualName: 'Говинда прия д. д.',
      avatarUrl: null,
    },
    ...over,
  });

  it('без открытых доступов не ходит в базу вовсе', async () => {
    const prisma = prismaMock();

    await expect(service(prisma).listFriendPlaylists('u1')).resolves.toEqual({
      items: [],
    });
    expect(prisma.musicPlaylist.findMany).not.toHaveBeenCalled();
  });

  it('спрашивает только у тех, кто открыл доступ', async () => {
    const prisma = prismaMock();
    prisma.activityFollow.findMany.mockResolvedValue([
      { granterId: 'friend-1', source: 'union' },
      { granterId: 'friend-1', source: 'contacts' },
    ]);
    prisma.musicPlaylist.findMany.mockResolvedValue([friendRow()]);

    await service(prisma).listFriendPlaylists('u1');

    const where = prisma.musicPlaylist.findMany.mock.calls[0][0].where;
    // Дубль по двум источникам доступа схлопнут: один человек — один раз.
    expect(where.ownerId.in).toEqual(['friend-1']);
    expect(where.visibility.in).toEqual(['friends', 'public']);
    expect(where.isSystem).toBe(false);
    // Пустой плейлист зовёт в никуда.
    expect(where.trackCount).toEqual({ gt: 0 });
  });

  it('наружу отдаёт духовное имя, а не мирское', async () => {
    const prisma = prismaMock();
    prisma.activityFollow.findMany.mockResolvedValue([
      { granterId: 'friend-1', source: 'union' },
    ]);
    prisma.musicPlaylist.findMany.mockResolvedValue([friendRow()]);

    const { items } = await service(prisma).listFriendPlaylists('u1');

    expect(items[0].owner.name).toBe('Говинда прия д. д.');
  });

  // Связь `SetNull`: уход администратора не уносит подборку, но показывать
  // её в списке «у друзей» не от кого.
  it('плейлист без владельца пропускает', async () => {
    const prisma = prismaMock();
    prisma.activityFollow.findMany.mockResolvedValue([
      { granterId: 'friend-1', source: 'union' },
    ]);
    prisma.musicPlaylist.findMany.mockResolvedValue([friendRow({ owner: null })]);

    const { items } = await service(prisma).listFriendPlaylists('u1');

    expect(items).toEqual([]);
  });
});

describe('MusicPlaylistsService.copyToSelf', () => {
  const source = (over = {}) => ({
    id: 'p-friend',
    title: 'Утренний киртан',
    description: null,
    visibility: 'friends',
    isSystem: false,
    ownerId: 'friend-1',
    owner: { name: 'Мирское имя', spiritualName: 'Говинда прия д. д.' },
    ...over,
  });

  it('чужой закрытый не копируется — 404, а не 403', async () => {
    const prisma = prismaMock();
    prisma.musicPlaylist.findUnique.mockResolvedValue(
      source({ visibility: 'private' }),
    );

    await expect(service(prisma).copyToSelf('u1', 'p-friend')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.musicPlaylist.create).not.toHaveBeenCalled();
  });

  it('при открытом доступе копирует записи и их порядок', async () => {
    const prisma = prismaMock();
    prisma.musicPlaylist.findUnique.mockResolvedValue(source());
    prisma.activityFollow.findFirst.mockResolvedValue({ id: 'f1' });
    // Один и тот же мок обслуживает и копирование, и подсчёт длительности:
    // отдаём обе формы сразу, чтобы не подменять его посреди вызова.
    prisma.musicPlaylistItem.findMany.mockResolvedValue([
      { trackId: 't1', playlistId: 'p-new', track: { durationSeconds: 100 } },
      { trackId: 't2', playlistId: 'p-new', track: { durationSeconds: 200 } },
    ]);

    await service(prisma).copyToSelf('u1', 'p-friend');

    const data = prisma.musicPlaylist.create.mock.calls[0][0].data;
    expect(data.ownerId).toBe('u1');
    expect(data.trackCount).toBe(2);
    expect(data.items.create.map((i: { trackId: string }) => i.trackId)).toEqual(
      ['t1', 't2'],
    );
    // Позиции разрежённые и по возрастанию — порядок оригинала сохранён.
    const positions = data.items.create.map(
      (i: { position: number }) => i.position,
    );
    expect(positions[0]).toBeLessThan(positions[1]);
  });

  // Чужой плейлист, ставший у меня открытым, разошёлся бы по кругу без ведома
  // того, кто его собрал.
  it('копия всегда личная и подписана, от кого', async () => {
    const prisma = prismaMock();
    prisma.musicPlaylist.findUnique.mockResolvedValue(source());
    prisma.activityFollow.findFirst.mockResolvedValue({ id: 'f1' });

    await service(prisma).copyToSelf('u1', 'p-friend');

    const data = prisma.musicPlaylist.create.mock.calls[0][0].data;
    expect(data.visibility).toBe('private');
    expect(data.title).toBe('Утренний киртан — от Говинда прия д. д.');
  });

  it('подборку редакции копировать можно и без доступа', async () => {
    const prisma = prismaMock();
    prisma.musicPlaylist.findUnique.mockResolvedValue(
      source({ isSystem: true, ownerId: null, owner: null }),
    );

    await service(prisma).copyToSelf('u1', 'p-sys');

    expect(prisma.musicPlaylist.create).toHaveBeenCalled();
    const data = prisma.musicPlaylist.create.mock.calls[0][0].data;
    expect(data.title).toBe('Утренний киртан — копия');
  });
});
