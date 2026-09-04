import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AccessTokenPayload } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { MusicIngestService } from './music-ingest.service';

const admin: AccessTokenPayload = {
  sub: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
};
const musicAdmin: AccessTokenPayload = {
  sub: 'sa-1',
  email: 'sa@example.com',
  role: 'service-admin',
  adminServices: ['music'],
};
const otherAdmin: AccessTokenPayload = {
  sub: 'sa-2',
  email: 'sa2@example.com',
  role: 'service-admin',
  adminServices: ['market'],
};

function build() {
  const prisma = {
    musicIngestBatch: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'b1' }),
      update: jest.fn().mockResolvedValue({ id: 'b1' }),
      delete: jest.fn().mockResolvedValue({}),
    },
    musicIngestItem: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    musicTrack: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn().mockResolvedValue({}),
      aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
    },
    musicTrackCategory: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    musicPlaylist: {
      create: jest.fn().mockResolvedValue({ id: 'p1' }),
    },
    $transaction: jest.fn(async (fn: unknown) =>
      typeof fn === 'function'
        ? (fn as (tx: unknown) => unknown)(prisma)
        : null,
    ),
  };
  const storage = {
    configured: true,
    buildIngestKey: jest.fn(() => 'music/portal/b1/x.mp3'),
    presignPut: jest.fn().mockResolvedValue('https://s3/put'),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  // Стадия приёма подменяется целиком: сервис партий только дёргает её и не
  // ждёт ответа, а лезть отсюда в S3 и теги незачем.
  const process = { processOnce: jest.fn().mockResolvedValue(0) };
  return {
    prisma,
    storage,
    process,
    service: new MusicIngestService(
      prisma,
      storage as never,
      process as never,
      { get: () => undefined } as never,
    ),
  };
}

describe('MusicIngestService: права', () => {
  it('пускает админа портала и админа сервиса', async () => {
    const { service } = build();
    await expect(service.list(admin)).resolves.toEqual([]);
    await expect(service.list(musicAdmin)).resolves.toEqual([]);
  });

  it('не пускает админа чужого сервиса', async () => {
    const { service, prisma } = build();
    await expect(service.list(otherAdmin)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.musicIngestBatch.findMany).not.toHaveBeenCalled();
  });
});

describe('MusicIngestService.addFiles', () => {
  it('заводит позиции и выдаёт подписанные ссылки', async () => {
    const { service, prisma, storage } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'draft',
      items: [],
    });
    prisma.musicIngestItem.create.mockResolvedValue({ id: 'i1' });

    const result = await service.addFiles(admin, 'b1', {
      files: [{ fileName: 'kirtan.mp3', mime: 'audio/mpeg', sizeBytes: 1024 }],
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      itemId: 'i1',
      url: 'https://s3/put',
    });
    // Заголовки обязаны совпасть с подписью — иначе S3 ответит 403.
    expect(result.items[0].headers['Content-Length']).toBe('1024');
    expect(storage.buildIngestKey).toHaveBeenCalledWith('b1', 'mp3');
  });

  it('отказывает по типу файла и позицию не заводит', async () => {
    const { service, prisma } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'draft',
      items: [],
    });

    await expect(
      service.addFiles(admin, 'b1', {
        files: [{ fileName: 'x.flac', mime: 'audio/flac', sizeBytes: 1024 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.musicIngestItem.create).not.toHaveBeenCalled();
  });

  it('в опубликованную партию дозаливать нельзя', async () => {
    const { service, prisma } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'published',
      items: [],
    });

    await expect(
      service.addFiles(admin, 'b1', {
        files: [{ fileName: 'a.mp3', mime: 'audio/mpeg', sizeBytes: 10 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('MusicIngestService.publish', () => {
  it('публикует черновики партии и переводит её в published', async () => {
    const { service, prisma } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'ready',
      items: [{ id: 'i1', status: 'stored', trackId: 't1' }],
    });

    await service.publish(admin, 'b1', {});

    expect(prisma.musicTrack.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['t1'] }, status: 'draft' },
        data: expect.objectContaining({ status: 'published' }),
      }),
    );
    expect(prisma.musicIngestBatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'published' }),
      }),
    );
  });

  it('непустое название собирает системную подборку в порядке партии', async () => {
    const { service, prisma } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'ready',
      items: [
        { id: 'i1', status: 'stored', trackId: 't1' },
        { id: 'i2', status: 'skipped', trackId: null },
        { id: 'i3', status: 'stored', trackId: 't2' },
      ],
    });

    await expect(
      service.publish(admin, 'b1', { playlistTitle: '  Вечерний киртан ' }),
    ).resolves.toEqual({ published: 2, playlistId: 'p1' });

    expect(prisma.musicPlaylist.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: 'admin-1',
          title: 'Вечерний киртан',
          isSystem: true,
          visibility: 'public',
          // Витрина берёт подборки с `trackCount > 0`: нуль здесь значит
          // молчаливо невидимую подборку.
          trackCount: 2,
          items: {
            create: [
              { trackId: 't1', position: 1000 },
              { trackId: 't2', position: 2000 },
            ],
          },
        }),
      }),
    );
  });

  it('пустое название подборку не собирает', async () => {
    const { service, prisma } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'ready',
      items: [{ id: 'i1', status: 'stored', trackId: 't1' }],
    });

    await expect(
      service.publish(admin, 'b1', { playlistTitle: '   ' }),
    ).resolves.toEqual({ published: 1, playlistId: null });
    expect(prisma.musicPlaylist.create).not.toHaveBeenCalled();
  });

  it('пока приём идёт, публиковать нельзя: остаток уже не опубликуешь', async () => {
    const { service, prisma } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'running',
      items: [
        { id: 'i1', status: 'stored', trackId: 't1' },
        { id: 'i2', status: 'waiting', trackId: null },
        { id: 'i3', status: 'fetching', trackId: null },
      ],
    });

    await expect(service.publish(admin, 'b1', {})).rejects.toThrow(
      'Дождитесь окончания приёма: ещё 2 позиции в работе',
    );
    // Ни одной записи в каталог и ни одной подборки: доехавший следом
    // остаток публиковать было бы уже нечем — партия закрыта.
    expect(prisma.musicTrack.updateMany).not.toHaveBeenCalled();
    expect(prisma.musicPlaylist.create).not.toHaveBeenCalled();
  });

  it('партию без единой доставленной позиции публиковать нечем', async () => {
    const { service, prisma } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'failed',
      items: [{ id: 'i1', status: 'failed', trackId: null }],
    });

    await expect(service.publish(admin, 'b1', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.musicTrack.updateMany).not.toHaveBeenCalled();
  });
});

describe('MusicIngestService.remove', () => {
  it('уносит и обложки черновиков: они вынуты из тегов и больше ничьи', async () => {
    const { service, prisma, storage } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'ready',
      items: [
        {
          storageKey: 'music/portal/b1/a.mp3',
          track: {
            id: 't1',
            status: 'draft',
            storageKey: 'music/portal/b1/a.mp3',
            coverKey: 'music/covers/track/b1/a.jpg',
          },
        },
      ],
    });

    await expect(service.remove(admin, 'b1')).resolves.toEqual({ ok: true });

    expect(storage.remove).toHaveBeenCalledWith('music/portal/b1/a.mp3');
    // Без этого обложка остаётся в бакете навсегда: карточки, которая на неё
    // ссылалась, уже нет, и найти её некому.
    expect(storage.remove).toHaveBeenCalledWith('music/covers/track/b1/a.jpg');
  });

  it('обложку опубликованной записи не трогает: запись осталась в каталоге', async () => {
    const { service, prisma, storage } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'published',
      items: [
        {
          storageKey: 'music/portal/b1/a.mp3',
          track: {
            id: 't1',
            status: 'published',
            storageKey: 'music/portal/b1/a.mp3',
            coverKey: 'music/covers/track/b1/a.jpg',
          },
        },
      ],
    });

    await expect(service.remove(admin, 'b1')).resolves.toEqual({ ok: true });
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

describe('MusicIngestService.removeItem', () => {
  it('одна позиция уносит свою обложку тем же движением', async () => {
    const { service, prisma, storage } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'ready',
      items: [],
    });
    prisma.musicIngestItem.findFirst.mockResolvedValue({
      id: 'i1',
      storageKey: 'music/portal/b1/a.mp3',
      track: {
        id: 't1',
        status: 'draft',
        storageKey: 'music/portal/b1/a.mp3',
        coverKey: 'music/covers/track/b1/a.jpg',
      },
    });

    await expect(service.removeItem(admin, 'b1', 'i1')).resolves.toEqual({
      ok: true,
    });
    expect(storage.remove).toHaveBeenCalledWith('music/covers/track/b1/a.jpg');
  });
});

describe('MusicIngestService.start', () => {
  it('возвращает в очередь ждущее и упавшее и дёргает стадию', async () => {
    const { service, prisma, process } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'ready',
      items: [{ id: 'i1', status: 'failed' }],
    });
    prisma.musicIngestItem.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.start(admin, 'b1')).resolves.toEqual({ queued: 1 });

    expect(prisma.musicIngestItem.updateMany).toHaveBeenCalledWith({
      where: { batchId: 'b1', status: { in: ['waiting', 'failed'] } },
      data: { status: 'waiting', attempts: 0, failureReason: null },
    });
    // Без «пинка» партия ждала бы следующего тика, а админ — на экране.
    expect(process.processOnce).toHaveBeenCalled();
  });

  it('опубликованную партию запускать нечем', async () => {
    const { service, prisma, process } = build();
    prisma.musicIngestBatch.findUnique.mockResolvedValue({
      id: 'b1',
      status: 'published',
      items: [],
    });

    await expect(service.start(admin, 'b1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(process.processOnce).not.toHaveBeenCalled();
  });
});
