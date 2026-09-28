import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MusicStorageService } from './music-storage.service';
import type { MusicMetadataReader } from './music-metadata-reader';
import {
  MusicUploadsService,
  REJECTED_TRACK_TTL_MS,
} from './music-uploads.service';

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
    musicAudiobookChapter: {
      aggregate: jest.fn().mockResolvedValue({ _max: { position: 4 } }),
      create: jest.fn().mockResolvedValue({}),
    },
  };

  return {
    tx,
    prisma: {
      musicTrack: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
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
      // Справочник исполнителей: по умолчанию исполнитель есть.
      musicArtist: {
        findUnique: jest.fn((args: { where: { id: string } }) =>
          Promise.resolve<{ id: string; lineage?: string | null } | null>({
            id: args.where.id,
          }),
        ),
      },
      // Книги (VED-297): по умолчанию книги нет.
      musicAudiobook: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            null as { id: string; readerId: string | null } | null,
          ),
      },
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

  it('m4a с Android (audio/x-m4a) подписывает под каноническим типом (VED-195)', async () => {
    const prisma = prismaMock();
    const storage = storageMock();

    const result = await service(prisma, storage).createUpload(
      'u1',
      body({ mime: 'audio/x-m4a', fileName: 'Golden Avatar.m4a' }),
    );

    expect(storage.buildKey).toHaveBeenCalledWith('u1', 'm4a');
    expect(storage.presignPut).toHaveBeenCalledWith(
      expect.any(String),
      'audio/mp4',
      4_000_000,
    );
    // Клиент кладёт в PUT именно этот тип, а не file.type: иначе подпись
    // разойдётся и S3 ответит 403.
    expect(result.headers['Content-Type']).toBe('audio/mp4');
    expect(prisma.prisma.musicUpload.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mime: 'audio/mp4' }),
    });
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
      service(prisma, storage).createUpload('u1', body({ mime: 'audio/aac' })),
    ).rejects.toThrow(BadRequestException);
    expect(storage.presignPut).not.toHaveBeenCalled();
  });

  it('FLAC больше обычного потолка принимает под пределом исходника (VED-244)', async () => {
    const prisma = prismaMock();
    const storage = storageMock();

    await service(prisma, storage).createUpload(
      'u1',
      body({ mime: 'audio/x-flac', sizeBytes: 400_000_000 }),
    );

    expect(storage.buildKey).toHaveBeenCalledWith('u1', 'flac');
    expect(storage.presignPut).toHaveBeenCalledWith(
      'music/uploads/u1/abc.mp3',
      'audio/flac',
      400_000_000,
    );
  });

  it('исходник больше гигабайта — отказ до ссылки', async () => {
    const prisma = prismaMock();
    const storage = storageMock();

    await expect(
      service(prisma, storage).createUpload(
        'u1',
        body({ mime: 'audio/wav', sizeBytes: 1024 * 1024 * 1024 + 1 }),
        true,
      ),
    ).rejects.toThrow(/большой/i);
    expect(storage.presignPut).not.toHaveBeenCalled();
  });

  it('в занятое место считает и ждущие перекодирования', async () => {
    const prisma = prismaMock();
    const storage = storageMock();

    await service(prisma, storage).createUpload('u1', body());

    expect(prisma.prisma.musicUpload.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          uploaderId: 'u1',
          status: { in: ['pending', 'transcode_queued', 'transcoding'] },
        },
      }),
    );
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

  it('опубликованное в квоту не считает — только то, что ещё на совести загрузившего', async () => {
    const prisma = prismaMock();
    const storage = storageMock();

    await service(prisma, storage).createUpload('u1', body());

    expect(prisma.prisma.musicTrack.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uploadedById: 'u1', status: { not: 'published' } },
      }),
    );
  });

  it('редакции Музыки квота не мешает', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicTrack.aggregate.mockResolvedValue({
      _sum: { sizeBytes: 50_000_000_000 },
    });

    await expect(
      service(prisma, storage).createUpload('u1', body(), true),
    ).resolves.toMatchObject({ uploadId: 'up1' });
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

  it('линия загрузившего на запись не переносится: она «для всех линий»', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);
    prisma.prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'devotee',
      lineage: 'sri_chaitanya_saraswat_math',
    });

    await service(prisma, storage).completeUpload('u1', 'up1', 'gaura.mp3');

    /* Раньше здесь стояла линия преданного, и это было тихой ошибкой: линия
       — утверждение о записи, а не о том, кто нажал «загрузить». Бхаджан
       Дурге получал линию Гаудия-матха и пропадал из каталога у преданных
       остальных линий, ничего им не объясняя. Ставит линию модератор. */
    expect(prisma.tx.musicTrack.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lineage: null }),
    });
  });

  it('выбранный при загрузке матх сохраняется у записи', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);

    await service(prisma, storage).completeUpload(
      'u1',
      'up1',
      'gaura.mp3',
      'sri_chaitanya_saraswat_math',
    );

    expect(prisma.tx.musicTrack.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        lineage: 'sri_chaitanya_saraswat_math',
      }),
    });
  });

  it('линия вне справочника — «для всех», а не отказ: файл уже в бакете', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);

    await service(prisma, storage).completeUpload(
      'u1',
      'up1',
      'gaura.mp3',
      'sri_chaitanya_matha' as never,
    );

    // Ронять заливку из-за поля, которое поправят в очереди, значит потерять
    // саму запись — а она уже залита.
    expect(prisma.tx.musicTrack.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lineage: null }),
    });
  });

  it('редакция грузит со страницы исполнителя — запись сразу с его именем (VED-114)', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);

    await service(prisma, storage).completeUpload(
      'u1',
      'up1',
      'gaura.mp3',
      null,
      'artist-avantika',
      true,
    );

    expect(prisma.tx.musicTrack.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ artistId: 'artist-avantika' }),
    });
  });

  it('линия не выбрана — запись берёт линию исполнителя (VED-566)', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);
    prisma.prisma.musicArtist.findUnique.mockResolvedValueOnce({
      id: 'artist-avantika',
      lineage: 'sri_chaitanya_saraswat_math',
    });

    await service(prisma, storage).completeUpload(
      'u1',
      'up1',
      'gaura.mp3',
      null,
      'artist-avantika',
      true,
    );

    expect(prisma.tx.musicTrack.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        artistId: 'artist-avantika',
        lineage: 'sri_chaitanya_saraswat_math',
      }),
    });
  });

  it('явно выбранная линия сильнее линии исполнителя (VED-566)', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);
    prisma.prisma.musicArtist.findUnique.mockResolvedValueOnce({
      id: 'artist-avantika',
      lineage: 'iskcon',
    });

    await service(prisma, storage).completeUpload(
      'u1',
      'up1',
      'gaura.mp3',
      'ipbys',
      'artist-avantika',
      true,
    );

    expect(prisma.tx.musicTrack.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lineage: 'ipbys' }),
    });
  });

  it('участнику исполнителя не ставит: «своя запись» с чужим именем была бы подлогом', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);

    await service(prisma, storage).completeUpload(
      'u1',
      'up1',
      'gaura.mp3',
      null,
      'artist-avantika',
      false,
    );

    expect(prisma.tx.musicTrack.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ artistId: expect.anything() }),
    });
    // Не отказ: файл уже в бакете, и запись создаётся — просто без подписи.
    expect(prisma.prisma.musicArtist.findUnique).not.toHaveBeenCalled();
  });

  it('исполнителя нет в справочнике — запись без подписи, а не упавшая заливка', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);
    prisma.prisma.musicArtist.findUnique.mockResolvedValue(null);

    const result = await service(prisma, storage).completeUpload(
      'u1',
      'up1',
      'gaura.mp3',
      null,
      'deleted-artist',
      true,
    );

    expect(result.trackId).toBe('t1');
    expect(prisma.tx.musicTrack.create).toHaveBeenCalledWith({
      data: expect.not.objectContaining({ artistId: expect.anything() }),
    });
  });

  // VED-297: «Загрузить главы» в редакторе книги — запись встаёт в конец
  // книги и получает чтеца, если исполнитель не выбран явно.
  it('загрузка из редактора книги ставит запись последней главой с чтецом', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);
    prisma.prisma.musicAudiobook.findUnique.mockResolvedValue({
      id: 'book-1',
      readerId: 'reader-1',
    });

    await service(prisma, storage).completeUpload(
      'u1',
      'up1',
      'glava-5.mp3',
      null,
      undefined,
      true,
      'book-1',
    );

    expect(prisma.tx.musicTrack.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ artistId: 'reader-1' }),
    });
    expect(prisma.tx.musicAudiobookChapter.create).toHaveBeenCalledWith({
      data: { audiobookId: 'book-1', trackId: 't1', position: 5 },
    });
  });

  it('участнику место в книге не выдаётся — как и подпись исполнителем', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);

    await service(prisma, storage).completeUpload(
      'u1',
      'up1',
      'glava-5.mp3',
      null,
      undefined,
      false,
      'book-1',
    );

    expect(prisma.prisma.musicAudiobook.findUnique).not.toHaveBeenCalled();
    expect(prisma.tx.musicAudiobookChapter.create).not.toHaveBeenCalled();
  });

  it('и у не-преданного тоже «для всех линий», а не ISKCON', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);
    prisma.prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'yogi',
      lineage: 'ipbys',
    });

    await service(prisma, storage).completeUpload('u1', 'up1', 'gaura.mp3');

    expect(prisma.tx.musicTrack.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ lineage: null }),
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

  it('дубль по ETag отклоняет, называет запись и убирает объект из бакета', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);
    prisma.prisma.musicUpload.findMany.mockResolvedValue([
      { storageKey: 'music/uploads/u1/old.mp3' },
    ]);
    prisma.prisma.musicTrack.findFirst.mockResolvedValue({
      title: 'Гаура-арати',
      status: 'pending',
    });

    await expect(
      service(prisma, storage).completeUpload('u1', 'up1', 'g.mp3'),
    ).rejects.toThrow(/«Гаура-арати» — на проверке/);
    expect(storage.remove).toHaveBeenCalledWith('music/uploads/u1/abc.mp3');
    expect(prisma.tx.musicTrack.create).not.toHaveBeenCalled();
  });

  it('прежней записи больше нет (удалена, отклонена, снята) — не дубль (VED-533)', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(pending);
    prisma.prisma.musicUpload.findMany.mockResolvedValue([
      { storageKey: 'music/uploads/u1/old.mp3' },
    ]);
    // Живых записей с этим файлом нет.
    prisma.prisma.musicTrack.findFirst.mockResolvedValue(null);

    await service(prisma, storage).completeUpload('u1', 'up1', 'g.mp3');

    const where = prisma.prisma.musicTrack.findFirst.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['published', 'pending', 'draft'] });
    expect(prisma.tx.musicTrack.create).toHaveBeenCalled();
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

describe('MusicUploadsService.cleanupRejected', () => {
  it('через месяц убирает отклонённую запись человека вместе с файлом', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicTrack.findMany.mockResolvedValue([
      { id: 't9', storageKey: 'music/uploads/u1/old.mp3' },
    ]);
    const now = new Date('2026-10-01T00:00:00Z');

    const removed = await service(prisma, storage).cleanupRejected(now);

    expect(removed).toBe(1);
    const where = prisma.prisma.musicTrack.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('rejected');
    expect(where.uploadedById).toEqual({ not: null });
    expect(where.updatedAt.lt.getTime()).toBe(
      now.getTime() - REJECTED_TRACK_TTL_MS,
    );
    expect(prisma.tx.musicTrack.delete).toHaveBeenCalledWith({
      where: { id: 't9' },
    });
    expect(storage.remove).toHaveBeenCalledWith('music/uploads/u1/old.mp3');
  });

  it('упавшая строка не останавливает остальные', async () => {
    const prisma = prismaMock();
    const storage = storageMock();
    prisma.prisma.musicTrack.findMany.mockResolvedValue([
      { id: 'a', storageKey: 'k/a' },
      { id: 'b', storageKey: 'k/b' },
    ]);
    prisma.tx.musicTrack.delete
      .mockRejectedValueOnce(new Error('уже удалена'))
      .mockResolvedValueOnce({});

    const removed = await service(prisma, storage).cleanupRejected();

    expect(removed).toBe(1);
    expect(storage.remove).toHaveBeenCalledWith('k/b');
    expect(storage.remove).not.toHaveBeenCalledWith('k/a');
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

/** Начало настоящего FLAC: `fLaC` и блок STREAMINFO. */
const FLAC_PREFIX = Buffer.concat([
  Buffer.from('fLaC'),
  Buffer.from([0x80, 0, 0, 34]),
  Buffer.alloc(40),
]);

describe('MusicUploadsService.completeUpload: FLAC, WAV и OGG (VED-244)', () => {
  const flac = {
    id: 'up1',
    uploaderId: 'u1',
    storageKey: 'music/uploads/u1/abc.flac',
    status: 'pending',
    mime: 'audio/flac',
    sizeBytes: 400_000_000,
    rightsBasis: 'own_recording' as const,
  };

  it('ставит в очередь перекодирования, записи пока не заводит', async () => {
    const prisma = prismaMock();
    const storage = storageMock({
      head: jest
        .fn()
        .mockResolvedValue({ sizeBytes: 400_000_000, etag: 'md5' }),
      readPrefix: jest.fn().mockResolvedValue(FLAC_PREFIX),
    });
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(flac);

    const result = await service(prisma, storage).completeUpload(
      'u1',
      'up1',
      'Киртан.flac',
      null,
      'artist-1',
      true,
    );

    expect(result).toEqual({
      uploadId: 'up1',
      trackId: null,
      status: null,
      title: 'Киртан',
      durationSeconds: null,
      transcoding: true,
    });
    expect(prisma.prisma.musicUpload.updateMany).toHaveBeenCalledWith({
      where: { id: 'up1', status: 'pending' },
      data: {
        status: 'transcode_queued',
        sizeBytes: 400_000_000,
        checksum: 'md5',
        transcodeAttempts: 0,
        transcodeRequest: {
          fileName: 'Киртан.flac',
          lineage: null,
          artistId: 'artist-1',
          audiobookId: null,
          canAssignArtist: true,
        },
      },
    });
    expect(prisma.tx.musicTrack.create).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('браузер назвал FLAC «mp3» — решает содержимое, а не тип', async () => {
    const prisma = prismaMock();
    const storage = storageMock({
      readPrefix: jest.fn().mockResolvedValue(FLAC_PREFIX),
    });
    prisma.prisma.musicUpload.findUnique.mockResolvedValue({
      ...flac,
      mime: 'audio/mpeg',
      sizeBytes: 4_000_000,
    });

    const result = await service(prisma, storage).completeUpload(
      'u1',
      'up1',
      'k.mp3',
    );

    expect(result.transcoding).toBe(true);
    expect(prisma.tx.musicTrack.create).not.toHaveBeenCalled();
  });

  it('заявлен FLAC, а внутри не он — отказ и объект убран', async () => {
    const prisma = prismaMock();
    const storage = storageMock({
      readPrefix: jest.fn().mockResolvedValue(Buffer.alloc(64, 0x41)),
    });
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(flac);

    await expect(
      service(prisma, storage).completeUpload('u1', 'up1', 'fake.flac'),
    ).rejects.toThrow(/Принимаем mp3, m4a, FLAC/);
    expect(storage.remove).toHaveBeenCalledWith('music/uploads/u1/abc.flac');
    expect(prisma.prisma.musicUpload.update).toHaveBeenCalledWith({
      where: { id: 'up1' },
      data: { status: 'failed', failureReason: 'mime_not_accepted' },
    });
    expect(prisma.prisma.musicUpload.updateMany).not.toHaveBeenCalled();
  });

  it('дубль по сумме исходника ловится до перекодирования', async () => {
    const prisma = prismaMock();
    const storage = storageMock({
      readPrefix: jest.fn().mockResolvedValue(FLAC_PREFIX),
    });
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(flac);
    prisma.prisma.musicUpload.findMany.mockResolvedValue([
      { storageKey: 'music/uploads/u1/old.m4a' },
    ]);
    prisma.prisma.musicTrack.findFirst.mockResolvedValue({
      title: 'Киртан',
      status: 'published',
    });

    await expect(
      service(prisma, storage).completeUpload('u1', 'up1', 'k.flac'),
    ).rejects.toThrow(/«Киртан» — в каталоге/);
    expect(storage.remove).toHaveBeenCalledWith('music/uploads/u1/abc.flac');
    expect(prisma.prisma.musicUpload.updateMany).not.toHaveBeenCalled();
  });

  it('повторный complete не ставит файл в очередь дважды', async () => {
    const prisma = prismaMock();
    const storage = storageMock({
      readPrefix: jest.fn().mockResolvedValue(FLAC_PREFIX),
    });
    prisma.prisma.musicUpload.findUnique.mockResolvedValue(flac);
    prisma.prisma.musicUpload.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service(prisma, storage).completeUpload('u1', 'up1', 'k.flac'),
    ).rejects.toThrow(/уже завершена/);
  });
});

describe('MusicUploadsService.acceptObject: перекодированный объект', () => {
  const input = {
    upload: {
      id: 'up1',
      uploaderId: 'u1',
      rightsBasis: 'own_recording' as const,
    },
    storageKey: 'music/uploads/u1/new.m4a',
    mime: 'audio/mp4',
    sizeBytes: 77_000_000,
    checksum: 'md5',
    raw: { format: {}, common: { title: 'Гаура-арати' } },
    durationSeconds: 2400,
    bitrateKbps: 256,
    request: {
      fileName: 'k.flac',
      lineage: null,
      artistId: null,
      audiobookId: null,
      canAssignArtist: false,
    },
    transcoded: true,
  };

  it('заводит запись m4a и переносит загрузку на новый ключ из `transcoding`', async () => {
    const prisma = prismaMock();
    const storage = storageMock();

    const result = await service(prisma, storage).acceptObject(input);

    expect(result).toMatchObject({
      ok: true,
      response: { trackId: 't1', transcoding: false, durationSeconds: 2400 },
    });
    expect(prisma.tx.musicTrack.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storageKey: 'music/uploads/u1/new.m4a',
        mime: 'audio/mp4',
        bitrateKbps: 256,
        title: 'Гаура-арати',
      }),
    });
    expect(prisma.tx.musicUpload.update).toHaveBeenCalledWith({
      where: { id: 'up1', status: 'transcoding' },
      data: {
        status: 'completed',
        storageKey: 'music/uploads/u1/new.m4a',
        mime: 'audio/mp4',
        sizeBytes: 77_000_000,
        checksum: 'md5',
      },
    });
  });

  it('отказ возвращает, а не бросает — решает воркер', async () => {
    const prisma = prismaMock();
    const storage = storageMock();

    const result = await service(prisma, storage).acceptObject({
      ...input,
      durationSeconds: 5 * 60 * 60,
    });

    expect(result).toEqual({
      ok: false,
      rejection: 'duration_too_long',
      message: 'Запись слишком длинная.',
    });
    expect(prisma.tx.musicTrack.create).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

describe('MusicUploadsService.uploadState', () => {
  const row = {
    id: 'up1',
    uploaderId: 'u1',
    storageKey: 'music/uploads/u1/new.m4a',
    failureReason: null,
  };

  it('чужая загрузка — 404', async () => {
    const prisma = prismaMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue({
      ...row,
      uploaderId: 'u2',
      status: 'transcoding',
    });

    await expect(
      service(prisma, storageMock()).uploadState('u1', 'up1'),
    ).rejects.toThrow(NotFoundException);
  });

  it.each([
    ['pending', 'uploading'],
    ['transcode_queued', 'transcoding'],
    ['transcoding', 'transcoding'],
  ])('%s → %s', async (status, state) => {
    const prisma = prismaMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue({ ...row, status });

    await expect(
      service(prisma, storageMock()).uploadState('u1', 'up1'),
    ).resolves.toEqual({
      uploadId: 'up1',
      state,
      trackId: null,
      failureReason: null,
    });
  });

  it('готово — с записью по ключу результата', async () => {
    const prisma = prismaMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue({
      ...row,
      status: 'completed',
    });
    prisma.prisma.musicTrack.findUnique.mockResolvedValue({ id: 't9' });

    await expect(
      service(prisma, storageMock()).uploadState('u1', 'up1'),
    ).resolves.toMatchObject({ state: 'completed', trackId: 't9' });
    expect(prisma.prisma.musicTrack.findUnique).toHaveBeenCalledWith({
      where: { storageKey: 'music/uploads/u1/new.m4a' },
      select: { id: true },
    });
  });

  it('отказ — код причины становится текстом для человека, фраза остаётся', async () => {
    const prisma = prismaMock();
    prisma.prisma.musicUpload.findUnique.mockResolvedValue({
      ...row,
      status: 'failed',
      failureReason: 'transcode_failed',
    });
    await expect(
      service(prisma, storageMock()).uploadState('u1', 'up1'),
    ).resolves.toMatchObject({
      state: 'failed',
      failureReason: expect.stringMatching(/перекодировать/),
    });

    prisma.prisma.musicUpload.findUnique.mockResolvedValue({
      ...row,
      status: 'failed',
      failureReason: 'Такая запись у вас уже есть: «К» — в каталоге.',
    });
    await expect(
      service(prisma, storageMock()).uploadState('u1', 'up1'),
    ).resolves.toMatchObject({
      failureReason: 'Такая запись у вас уже есть: «К» — в каталоге.',
    });
  });
});
