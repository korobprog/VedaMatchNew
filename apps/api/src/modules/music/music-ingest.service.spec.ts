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
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    musicTrack: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
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
  return {
    prisma,
    storage,
    service: new MusicIngestService(
      prisma,
      storage as never,
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
