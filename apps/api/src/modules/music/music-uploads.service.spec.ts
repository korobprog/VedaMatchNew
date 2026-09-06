import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MusicStorageService } from './music-storage.service';
import type { MusicMetadataReader } from './music-metadata-reader';
import { MusicUploadsService } from './music-uploads.service';

function storageMock(over: Record<string, unknown> = {}) {
  return {
    configured: true,
    buildKey: jest.fn(() => 'music/uploads/u1/abc.mp3'),
    presignPut: jest.fn().mockResolvedValue('https://s3.example/put'),
    presignGet: jest.fn().mockResolvedValue('https://s3.example/get'),
    head: jest.fn().mockResolvedValue({ sizeBytes: 4_000_000, etag: 'abc123' }),
    readPrefix: jest.fn().mockResolvedValue(Buffer.from('id3')),
    // В базовом наборе, а не только в переопределениях: `...over` не
    // расширяет выведенный тип, и обращение к `storage.put` в тесте не
    // прошло бы typecheck, хотя jest его типы не проверяет и тест бы зеленел.
    put: jest.fn().mockResolvedValue(true),
    remove: jest.fn().mockResolvedValue(undefined),
    coverUrl: jest.fn(() => null),
    ...over,
  };
}

function prismaMock() {
  const tx = {
    musicTrack: {
      create: jest
        .fn()
        .mockImplementation(({ data }) => ({ id: 't1', ...data })),
      delete: jest.fn().mockResolvedValue({}),
    },
    musicUpload: {
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    musicTrackCategory: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  return {
    tx,
    prisma: {
      musicTrack: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      musicUpload: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'up1', ...data })),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      // Портальный профиль читается ради линии записи: этап и линия
      // загрузившего. По умолчанию человека нет — линия падает в ISKCON.
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    },
  };
}

const config = { get: jest.fn(() => undefined) } as unknown as ConfigService;

/**
 * Читатель тегов подменяется целиком: за настоящим стоит ESM-пакет, а
 * разбор его ответа проверяет music-metadata-parse.spec.
 */
function metadataMock(over: Record<string, unknown> = {}) {
  return {
    read: jest.fn().mockResolvedValue({
      format: { duration: 198, bitrate: 192000 },
      common: { title: 'Гаура-арати' },
    }),
    ...over,
  };
}

function service(
  prisma: ReturnType<typeof prismaMock>,
  storage: ReturnType<typeof storageMock>,
  metadata: ReturnType<typeof metadataMock> = metadataMock(),
) {
  return new MusicUploadsService(
    prisma.prisma as unknown as PrismaService,
    storage as unknown as MusicStorageService,
    metadata as unknown as MusicMetadataReader,
    config,
  );
}

const body = (over: Record<string, unknown> = {}) => ({
  fileName: 'gaura.mp3',
  mime: 'audio/mpeg',
  sizeBytes: 4_000_000,
  rightsBasis: 'own_recording' as const,
  ...over,
});

describe('MusicUploadsService.createUpload', () => {
  it('выдаёт подписанный PUT и заводит строку загрузки', async () => {
    const prisma = prismaMock();
    const storage = storageMock();

    const result = await service(prisma, storage).createUpload('u1', body());

    expect(result.url).toBe('https://s3.example/put');
    expect(result.uploadId).toBe('up1');
    expect(prisma.prisma.musicUpload.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        uploaderId: 'u1',
        status: 'pending',
        mime: 'audio/mpeg',
        rightsBasis: 'own_recording',
      }),
    });
  });

  it('подписывает ровно тот тип и размер, что вернул клиенту', async () => {
    const prisma = prismaMock();
    const storage = storageMock();

    const result = await service(prisma, storage).createUpload('u1', body());

    expect(storage.presignPut).toHaveBeenCalledWith(
      'music/uploads/u1/abc.mp3',
      'audio/mpeg',
      4_000_000,
    );
    expect(result.headers['Content-Type']).toBe('audio/mpeg');
    expect(result.headers['Content-Length']).toBe('4000000');
  });

  it('без настроенного хранилища отвечает «недоступно», а не падает', async () => {
    const prisma = prismaMock();
    const storage = storageMock({ configured: false });

    await expect(
      service(prisma, storage).createUpload('u1', body()),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('чужой формат отклоняет до выдачи ссылки', async () => {
    const prisma = prismaMock();
    const storage = storageMock();

    await expect(
      service(prisma, storage).createUpload('u1', body({ mime: 'audio/flac' })),
    ).rejects.toThrow(BadRequestException);
    expect(storage.presignPut).not.toHaveBeenCalled();
  });

  it('в занятое место считает и незавершённые загрузки', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    // Квота по умолчанию — 2 ГиБ. По отдельности ни записи, ни заливки её
    // не превышают; вместе — превышают, и в этом весь смысл проверки.
    prisma.prisma.musicTrack.aggregate.mockResolvedValue({
      _sum: { sizeBytes: 1_100_000_000 },
    });
    prisma.prisma.musicUpload.aggregate.mockResolvedValue({
      _sum: { sizeBytes: 1_100_000_000 },
    });

    await expect(
      service(prisma, storage).createUpload('u1', body()),
    ).rejects.toThrow(/место/i);
  });
});

describe('MusicUploadsService.completeUpload', () => {
  const pending = {
    id: 'up1',
    uploaderId: 'u1',
    storageKey: 'music/uploads/u1/abc.mp3',
    status: 'pending',
    mime: 'audio/mpeg',
    sizeBytes: 4_000_000,
    rightsBasis: 'own_recording' as const,
  };

  it('свою запись публикует сразу — риск на том, кто её принёс', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);

    const result = await service(prisma, storage).completeUpload(
      'u1',
      'up1',
      'gaura.mp3',
    );

    expect(result.status).toBe('published');
    expect(prisma.tx.musicTrack.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'published',
        uploadedById: 'u1',
        durationSeconds: 198,
        bitrateKbps: 192,
      }),
    });
  });

  it('линия записи — линия преданного, который её принёс', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);
    prisma.prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'devotee',
      lineage: 'sri_chaitanya_saraswat_math',
    });

    await service(prisma, storage).completeUpload('u1', 'up1', 'gaura.mp3');

    expect(prisma.tx.musicTrack.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        lineage: 'sri_chaitanya_saraswat_math',
      }),
    });
  });

  it('у не-преданного запись подписывается ISKCON по умолчанию', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);
    prisma.prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'yogi',
      lineage: 'ipbys',
    });

    await service(prisma, storage).completeUpload('u1', 'up1', 'gaura.mp3');

    expect(prisma.tx.musicTrack.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lineage: 'iskcon' }),
    });
  });

  it('опубликованная сразу получает дату публикации', async () => {
    // Без неё запись не попадёт в «Новое в каталоге» и повиснет невидимкой.
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);

    await service(prisma, storage).completeUpload('u1', 'up1', 'gaura.mp3');

    expect(
      prisma.tx.musicTrack.create.mock.calls[0][0].data.publishedAt,
    ).toBeInstanceOf(Date);
  });

  it('запись с открытой программы ждёт проверки', async () => {
    // Чужое исполнение: отвечать за него будет портал.
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue({
      ...pending,
      rightsBasis: 'open_program',
    });

    const result = await service(prisma, storage).completeUpload(
      'u1',
      'up1',
      'gaura.mp3',
    );

    expect(result.status).toBe('pending');
    expect(
      prisma.tx.musicTrack.create.mock.calls[0][0].data.publishedAt,
    ).toBeUndefined();
  });

  it('верит размеру из бакета, а не обещанному браузером', async () => {
    const prisma = prismaMock();
    // Объект целиком помещается в прочитанный кусок — длительности из
    // разбора можно верить, и проверка остаётся про размер.
    const storage = storageMock({
      head: jest.fn().mockResolvedValue({ sizeBytes: 3, etag: 'x' }),
    });
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);

    await service(prisma, storage).completeUpload('u1', 'up1', 'gaura.mp3');

    expect(prisma.tx.musicTrack.create.mock.calls[0][0].data.sizeBytes).toBe(3);
  });

  it('вшитую в файл обложку кладёт в бакет и ставит записи', async () => {
    // Люди заливают записи с уже вшитой картинкой, а плитка в каталоге
    // оставалась градиентной заглушкой: обложку искали и грузили второй раз
    // руками.
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);

    await service(
      prisma,
      storage,
      metadataMock({
        read: jest.fn().mockResolvedValue({
          format: { duration: 198, bitrate: 192000 },
          common: {
            title: 'Гаура-арати',
            picture: [{ format: 'image/jpeg', data: new Uint8Array(64) }],
          },
        }),
      }),
    ).completeUpload('u1', 'up1', 'gaura.mp3');

    const [key, data, mime] = storage.put.mock.calls[0];
    // Путь тот же, что и у загруженной руками: вид `track`, владелец —
    // заливший. Так её видят те же проверки принадлежности ключа.
    expect(key).toMatch(/^music\/covers\/track\/u1\/.+\.jpg$/);
    expect(data.byteLength).toBe(64);
    expect(mime).toBe('image/jpeg');
    expect(prisma.tx.musicTrack.create.mock.calls[0][0].data.coverKey).toBe(
      key,
    );
  });

  it('без картинки в тегах обложку не выдумывает', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);

    await service(prisma, storage).completeUpload('u1', 'up1', 'gaura.mp3');

    expect(storage.put).not.toHaveBeenCalled();
    expect(
      prisma.tx.musicTrack.create.mock.calls[0][0].data.coverKey,
    ).toBeUndefined();
  });

  it('незалившаяся обложка не роняет принятую запись', async () => {
    // Обложка украшает карточку, но ронять из-за неё запись нельзя:
    // модератор поставит свою.
    const prisma = prismaMock();
    const storage = storageMock({ put: jest.fn().mockResolvedValue(false) });
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);

    const result = await service(
      prisma,
      storage,
      metadataMock({
        read: jest.fn().mockResolvedValue({
          format: { duration: 198, bitrate: 192000 },
          common: {
            title: 'Гаура-арати',
            picture: [{ format: 'image/jpeg', data: new Uint8Array(64) }],
          },
        }),
      }),
    ).completeUpload('u1', 'up1', 'gaura.mp3');

    expect(result.trackId).toBe('t1');
    expect(
      prisma.tx.musicTrack.create.mock.calls[0][0].data.coverKey,
    ).toBeUndefined();
  });

  it('чужую загрузку не показывает даже кодом ответа', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue({
      ...pending,
      uploaderId: 'кто-то другой',
    });

    await expect(
      service(prisma, storage).completeUpload('u1', 'up1', 'g.mp3'),
    ).rejects.toThrow(NotFoundException);
  });

  it('повторное завершение отклоняет', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue({
      ...pending,
      status: 'completed',
    });

    await expect(
      service(prisma, storage).completeUpload('u1', 'up1', 'g.mp3'),
    ).rejects.toThrow(BadRequestException);
  });

  it('когда файла в бакете нет — помечает загрузку неудачной', async () => {
    const prisma = prismaMock();
    const storage = storageMock({ head: jest.fn().mockResolvedValue(null) });
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);

    await expect(
      service(prisma, storage).completeUpload('u1', 'up1', 'g.mp3'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.prisma.musicUpload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });

  it('дубль по ETag отклоняет и убирает объект из бакета', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);
    prisma.prisma.musicUpload.findFirst.mockResolvedValue({ id: 'старая' });

    await expect(
      service(prisma, storage).completeUpload('u1', 'up1', 'g.mp3'),
    ).rejects.toThrow(BadRequestException);
    expect(storage.remove).toHaveBeenCalledWith('music/uploads/u1/abc.mp3');
    expect(prisma.tx.musicTrack.create).not.toHaveBeenCalled();
  });

  it('нечитаемые теги — отказ, а не запись с нулевой длительностью', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);

    await expect(
      service(
        prisma,
        storage,
        metadataMock({ read: jest.fn().mockResolvedValue(null) }),
      ).completeUpload('u1', 'up1', 'g.mp3'),
    ).rejects.toThrow(/длительность/i);
    expect(prisma.tx.musicTrack.create).not.toHaveBeenCalled();
  });

  it('когда начало объекта не прочиталось, до пакета тегов не доходит', async () => {
    const prisma = prismaMock();
    const storage = storageMock({
      readPrefix: jest.fn().mockResolvedValue(null),
    });
    const metadata = metadataMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);

    await expect(
      service(prisma, storage, metadata).completeUpload('u1', 'up1', 'g.mp3'),
    ).rejects.toThrow(/длительность/i);
    expect(metadata.read).not.toHaveBeenCalled();
  });
});

describe('MusicUploadsService.cleanupStale', () => {
  it('убирает брошенную заливку вместе с объектом', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findMany.mockResolvedValue([
      { id: 'up1', storageKey: 'music/uploads/u1/abc.mp3' },
    ]);

    const removed = await service(prisma, storage).cleanupStale();

    expect(removed).toBe(1);
    expect(storage.remove).toHaveBeenCalledWith('music/uploads/u1/abc.mp3');
  });

  it('строку, уведённую другим процессом, не трогает', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findMany.mockResolvedValue([
      { id: 'up1', storageKey: 'music/uploads/u1/abc.mp3' },
    ]);
    // Клейм не удался: статус успел смениться.
    prisma.prisma.musicUpload.updateMany.mockResolvedValue({ count: 0 });

    const removed = await service(prisma, storage).cleanupStale();

    expect(removed).toBe(0);
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

describe('MusicUploadsService.myUploads', () => {
  it('показывает свои записи вместе с решением редакции', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicTrack.findMany.mockResolvedValue([
      {
        id: 't1',
        title: 'Мой киртан',
        status: 'rejected',
        durationSeconds: 7,
        sizeBytes: 104250,
        moderationNote: 'Запись чужого концерта',
        createdAt: new Date('2026-08-27T10:00:00.000Z'),
        publishedAt: null,
      },
    ]);

    const result = await service(prisma, storage).myUploads('u1');

    expect(result.items[0]).toMatchObject({
      trackId: 't1',
      status: 'rejected',
      moderationNote: 'Запись чужого концерта',
      canDelete: true,
    });
  });

  it('опубликованную снять нельзя — она уже в общем каталоге', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicTrack.findMany.mockResolvedValue([
      {
        id: 't1',
        title: 'Гаура-арати',
        status: 'published',
        durationSeconds: 7,
        sizeBytes: 1,
        moderationNote: null,
        createdAt: new Date(),
        publishedAt: new Date(),
      },
    ]);

    const result = await service(prisma, storage).myUploads('u1');

    expect(result.items[0].canDelete).toBe(false);
  });
});

describe('MusicUploadsService.deleteMyTrack', () => {
  const own = {
    id: 't1',
    uploadedById: 'u1',
    status: 'rejected',
    storageKey: 'music/uploads/u1/abc.mp3',
  };

  it('снимает свою запись вместе с файлом', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicTrack.findUnique.mockResolvedValue(own);

    await service(prisma, storage).deleteMyTrack('u1', 't1');

    expect(prisma.tx.musicTrack.delete).toHaveBeenCalledWith({
      where: { id: 't1' },
    });
    expect(storage.remove).toHaveBeenCalledWith('music/uploads/u1/abc.mp3');
  });

  it('чужую не показывает даже кодом ответа', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicTrack.findUnique.mockResolvedValue({
      ...own,
      uploadedById: 'кто-то другой',
    });

    await expect(
      service(prisma, storage).deleteMyTrack('u1', 't1'),
    ).rejects.toThrow(NotFoundException);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('опубликованную не отдаёт снимать', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicTrack.findUnique.mockResolvedValue({
      ...own,
      status: 'published',
    });

    await expect(
      service(prisma, storage).deleteMyTrack('u1', 't1'),
    ).rejects.toThrow(/редакция/i);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('файл убирает после базы: осиротевшая строка хуже осиротевшего объекта', async () => {
    const prisma = prismaMock();
    const order: string[] = [];
    const storage = storageMock({
      remove: jest.fn().mockImplementation(() => {
        order.push('s3');
        return Promise.resolve();
      }),
    });
    prisma.prisma.musicTrack.findUnique.mockResolvedValue(own);
    prisma.tx.musicTrack.delete.mockImplementation(() => {
      order.push('db');
      return Promise.resolve({});
    });

    await service(prisma, storage).deleteMyTrack('u1', 't1');

    expect(order).toEqual(['db', 's3']);
  });
});
