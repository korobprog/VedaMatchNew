import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import { MusicAdminQueueService } from './music-admin-queue.service';

const config = { get: jest.fn(() => undefined) } as unknown as ConfigService;

function prismaMock() {
  return {
    musicTrack: {
      findUnique: jest.fn().mockResolvedValue({ id: 't1', publishedAt: null }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: 't1', ...data })),
      count: jest.fn().mockResolvedValue(0),
      aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
    },
    musicUpload: { findMany: jest.fn().mockResolvedValue([]) },
    musicArtist: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    musicAlbum: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    musicCategory: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    musicReport: { count: jest.fn().mockResolvedValue(0) },
  };
}

const service = (prisma: ReturnType<typeof prismaMock>) =>
  new MusicAdminQueueService(prisma as unknown as PrismaService, config);

describe('MusicAdminQueueService.decide', () => {
  it('не пускает не-администратора', async () => {
    await expect(
      service(prismaMock()).decide(false, 't1', { decision: 'publish' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('публикует и ставит дату публикации', async () => {
    const prisma = prismaMock();

    await service(prisma).decide(true, 't1', { decision: 'publish' });

    const data = prisma.musicTrack.update.mock.calls[0][0].data;
    expect(data.status).toBe('published');
    expect(data.publishedAt).toBeInstanceOf(Date);
  });

  it('возврат снятой записи не поднимает её в «Новом» заново', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findUnique.mockResolvedValue({
      id: 't1',
      publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await service(prisma).decide(true, 't1', { decision: 'publish' });

    expect(prisma.musicTrack.update.mock.calls[0][0].data).not.toHaveProperty(
      'publishedAt',
    );
  });

  describe('причина', () => {
    it('для отказа обязательна', async () => {
      await expect(
        service(prismaMock()).decide(true, 't1', { decision: 'reject' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('для скрытия обязательна', async () => {
      await expect(
        service(prismaMock()).decide(true, 't1', { decision: 'hide' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('пробелы причиной не считаются', async () => {
      await expect(
        service(prismaMock()).decide(true, 't1', {
          decision: 'reject',
          note: '   ',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('для публикации не обязательна, но сохраняется', async () => {
      const prisma = prismaMock();

      await service(prisma).decide(true, 't1', {
        decision: 'publish',
        note: 'поправил исполнителя',
      });

      expect(
        prisma.musicTrack.update.mock.calls[0][0].data.moderationNote,
      ).toBe('поправил исполнителя');
    });

    it('слишком длинную режет', async () => {
      const prisma = prismaMock();

      await service(prisma).decide(true, 't1', {
        decision: 'reject',
        note: 'я'.repeat(900),
      });

      expect(
        prisma.musicTrack.update.mock.calls[0][0].data.moderationNote,
      ).toHaveLength(500);
    });
  });

  it('несуществующую запись не находит', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findUnique.mockResolvedValue(null);

    await expect(
      service(prisma).decide(true, 'нет', { decision: 'publish' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('MusicAdminQueueService.queue', () => {
  it('основание прав достаёт одним запросом на всю очередь, а не построчно', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findMany.mockResolvedValue([
      {
        id: 't1',
        title: 'A',
        storageKey: 'k1',
        durationSeconds: 10,
        language: null,
        isLiveRecording: false,
        playCount: 0,
        publishedAt: null,
        coverKey: null,
        artist: null,
        album: null,
        categories: [],
        status: 'pending',
        sizeBytes: 1,
        bitrateKbps: null,
        lyrics: null,
        transliteration: null,
        translation: null,
        moderationNote: null,
        uploadedBy: { id: 'u1', name: 'Иван Петров' },
      },
      {
        id: 't2',
        title: 'B',
        storageKey: 'k2',
        durationSeconds: 10,
        language: null,
        isLiveRecording: false,
        playCount: 0,
        publishedAt: null,
        coverKey: null,
        artist: null,
        album: null,
        categories: [],
        status: 'pending',
        sizeBytes: 1,
        bitrateKbps: null,
        lyrics: null,
        transliteration: null,
        translation: null,
        moderationNote: null,
        uploadedBy: null,
      },
    ]);
    prisma.musicUpload.findMany.mockResolvedValue([
      { storageKey: 'k1', rightsBasis: 'open_program', createdAt: new Date() },
    ]);

    const items = await service(prisma).queue(true);

    expect(prisma.musicUpload.findMany).toHaveBeenCalledTimes(1);
    expect(items[0].rightsBasis).toBe('open_program');
    // У второй записи строки загрузки нет — это не повод её прятать.
    expect(items[1].rightsBasis).toBeNull();
  });

  it('в модерации показывает мирское имя, а не духовное', async () => {
    const prisma = prismaMock();
    prisma.musicTrack.findMany.mockResolvedValue([
      {
        id: 't1',
        title: 'A',
        storageKey: 'k1',
        durationSeconds: 10,
        language: null,
        isLiveRecording: false,
        playCount: 0,
        publishedAt: null,
        coverKey: null,
        artist: null,
        album: null,
        categories: [],
        status: 'pending',
        sizeBytes: 1,
        bitrateKbps: null,
        lyrics: null,
        transliteration: null,
        translation: null,
        moderationNote: null,
        uploadedBy: { id: 'u1', name: 'Иван Петров' },
      },
    ]);

    const items = await service(prisma).queue(true);

    expect(items[0].uploader).toEqual({ id: 'u1', name: 'Иван Петров' });
    // select тянет только id и мирское имя: духовного здесь быть не должно.
    const select =
      prisma.musicTrack.findMany.mock.calls[0][0].include.uploadedBy.select;
    expect(select).toEqual({ id: true, name: true });
  });

  it('очередь отдаёт по возрасту: кто раньше пришёл', async () => {
    const prisma = prismaMock();

    await service(prisma).queue(true);

    expect(prisma.musicTrack.findMany.mock.calls[0][0].orderBy).toEqual({
      createdAt: 'asc',
    });
  });
});
