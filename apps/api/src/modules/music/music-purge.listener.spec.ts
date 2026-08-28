import type { PrismaService } from '../../prisma/prisma.service';
import { MusicPurgeListener } from './music-purge.listener';

function prismaMock() {
  return {
    musicTrack: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    musicUpload: { findMany: jest.fn().mockResolvedValue([]) },
    musicPlaylist: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

const listener = (prisma: ReturnType<typeof prismaMock>) =>
  new MusicPurgeListener(prisma as unknown as PrismaService);

describe('MusicPurgeListener', () => {
  it('отдаёт порталу ключи только неопубликованного', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findMany.mockResolvedValue([
      { storageKey: 'music/kept.mp3', publishedAt: new Date() },
      { storageKey: 'music/gone.mp3', publishedAt: null },
    ]);

    const plan = await listener(prisma).collectStorageKeys({ userId: 'u1' });

    expect(plan.storageKeys).toEqual(['music/gone.mp3']);
    expect(plan.counts).toEqual({ musicTracks: 1, musicTracksKept: 1 });
  });

  it('удаляет свои неопубликованные строки — каскад по SetNull их не заберёт', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findMany.mockResolvedValue([
      { storageKey: 'music/gone.mp3', publishedAt: null },
    ]);

    await listener(prisma).collectStorageKeys({ userId: 'u1' });

    expect(prisma.musicTrack.deleteMany).toHaveBeenCalledWith({
      where: { uploadedById: 'u1', publishedAt: null },
    });
  });

  it('опубликованные не трогает вовсе', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findMany.mockResolvedValue([
      { storageKey: 'music/kept.mp3', publishedAt: new Date() },
    ]);

    await listener(prisma).collectStorageKeys({ userId: 'u1' });

    // Ни одного удаления: удалять нечего, и лишний запрос по `publishedAt: null`
    // на живом портале — это блокировка строк каталога на пустом месте.
    expect(prisma.musicTrack.deleteMany).not.toHaveBeenCalled();
  });

  it('у человека без единой записи ничего не делает', async () => {
    const prisma = prismaMock();

    const plan = await listener(prisma).collectStorageKeys({ userId: 'u1' });

    expect(plan.storageKeys).toEqual([]);
    expect(prisma.musicTrack.deleteMany).not.toHaveBeenCalled();
  });

  it('забирает обложки своих плейлистов и брошенные загрузки', async () => {
    const prisma = prismaMock();
    prisma.musicUpload.findMany.mockResolvedValue([
      { storageKey: 'music/uploads/abandoned.mp3' },
    ]);
    prisma.musicPlaylist.findMany.mockResolvedValue([
      { coverKey: 'music/covers/p1.jpg' },
    ]);

    const plan = await listener(prisma).collectStorageKeys({ userId: 'u1' });

    expect(plan.storageKeys).toEqual([
      'music/uploads/abandoned.mp3',
      'music/covers/p1.jpg',
    ]);
  });

  describe('плейлисты', () => {
    /**
     * Связь с человеком стала `SetNull` ради подборок портала: они обязаны
     * пережить уход заведшего их администратора. Личные подборки после этого
     * каскад уже не заберёт, и снимать их обязан слушатель.
     */
    it('снимает свои плейлисты сам', async () => {
      const prisma = prismaMock();

      await listener(prisma).collectStorageKeys({ userId: 'u1' });

      expect(prisma.musicPlaylist.deleteMany).toHaveBeenCalledWith({
        where: { ownerId: 'u1', isSystem: false },
      });
    });

    it('подборку портала не трогает — ни в плане ключей, ни в удалении', async () => {
      const prisma = prismaMock();

      await listener(prisma).collectStorageKeys({ userId: 'u1' });

      expect(prisma.musicPlaylist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: 'u1', isSystem: false },
        }),
      );
      expect(prisma.musicPlaylist.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isSystem: false }),
        }),
      );
    });
  });
});
