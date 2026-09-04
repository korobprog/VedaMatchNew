import { MusicIngestProcessService } from './music-ingest-process.service';
import {
  IngestFetchError,
  type ArchiveEntrySink,
  type ExpandedArchive,
  type ExtractedArchiveEntry,
} from './music-ingest-fetch.service';

/**
 * Стадия приёма целиком в базе и S3, и тестировать её обёртку незачем — но
 * разбор архива держит объекты в бакете, а строки в базе, и рассинхрон между
 * ними тут стоит дороже всего: ключ, не попавший в позицию, не найдёт уже
 * никто. Поэтому проверяем именно порядок «объект — строка», подменив и
 * доставку, и хранилище.
 */

const entry = (name: string, key: string): ExtractedArchiveEntry => ({
  entryPath: name,
  storageKey: key,
  sizeBytes: 1024,
  checksum: `md5-${name}`,
  mime: 'audio/mpeg',
});

function build() {
  const prisma = {
    musicIngestItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      aggregate: jest.fn().mockResolvedValue({ _max: { position: 2 } }),
    },
    musicIngestBatch: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ status: 'running', items: [{ status: 'waiting' }] }),
      update: jest.fn().mockResolvedValue({}),
    },
    musicTrack: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { sizeBytes: 0 } }),
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    musicUpload: { findFirst: jest.fn().mockResolvedValue(null) },
    musicTrackCategory: { createMany: jest.fn() },
    $transaction: jest.fn(async (fn: unknown) =>
      typeof fn === 'function'
        ? (fn as (tx: unknown) => unknown)(prisma)
        : null,
    ),
  };
  const storage = {
    configured: true,
    remove: jest.fn().mockResolvedValue(undefined),
    head: jest.fn(),
    readPrefix: jest.fn(),
    put: jest.fn(),
    buildIngestKey: jest.fn(() => 'music/portal/b1/x.mp3'),
  };
  const metadata = { read: jest.fn() };
  const fetcher = { expandArchive: jest.fn(), fetchUrl: jest.fn() };

  const service = new MusicIngestProcessService(
    prisma as never,
    storage as never,
    metadata as never,
    fetcher as never,
    { get: () => undefined } as never,
  );

  /** Очередь из одной позиции-архива: её и разбирает `processOnce`. */
  const queueArchive = () => {
    prisma.musicIngestItem.findMany
      // Первый вызов — сама очередь.
      .mockResolvedValueOnce([{ id: 'zip-1' }])
      // Второй — перестановка позиций архива после обновления статуса.
      .mockResolvedValue([]);
    prisma.musicIngestItem.findUnique.mockResolvedValue({
      id: 'zip-1',
      batchId: 'b1',
      source: 'zip',
      sourceRef: 'album.zip',
      storageKey: 'music/portal/b1/album.zip',
      attempts: 1,
      checksum: null,
      batch: {
        id: 'b1',
        language: null,
        artistId: null,
        albumId: null,
        categoryIds: [],
        isLiveRecording: false,
      },
    });
  };

  /** Как позиция архива закончила: последний `update` по её строке. */
  const archiveUpdate = () =>
    prisma.musicIngestItem.update.mock.calls
      .filter((call) => (call[0] as { where: { id: string } }).where.id === 'zip-1')
      .at(-1)?.[0] as { data: Record<string, unknown> } | undefined;

  return { prisma, storage, fetcher, service, queueArchive, archiveUpdate };
}

describe('MusicIngestProcessService: разбор архива', () => {
  it('заводит позицию на каждую запись по мере заливки', async () => {
    const { prisma, fetcher, service, queueArchive, archiveUpdate } = build();
    queueArchive();
    fetcher.expandArchive.mockImplementation(
      async (
        _batchId: string,
        _key: string,
        _remaining: number,
        onEntry: ArchiveEntrySink,
      ): Promise<ExpandedArchive> => {
        await onEntry(entry('01.mp3', 'music/portal/b1/a.mp3'));
        await onEntry(entry('02.mp3', 'music/portal/b1/b.mp3'));
        return { takenCount: 2, truncatedReason: null };
      },
    );

    await service.processOnce();

    // Ключ каждой записи попадает в базу сразу за её заливкой: одной
    // транзакцией в конце он терялся вместе со всей распаковкой.
    const keys = prisma.musicIngestItem.create.mock.calls.map(
      (call) => (call[0] as { data: { storageKey: string } }).data.storageKey,
    );
    expect(keys).toEqual(['music/portal/b1/a.mp3', 'music/portal/b1/b.mp3']);
    expect(archiveUpdate()?.data).toMatchObject({
      status: 'skipped',
      failureReason: 'Архив разобран',
      storageKey: null,
    });
  });

  it('сбой посреди разбора не теряет заведённого и не зовёт вторую распаковку', async () => {
    const { prisma, storage, fetcher, service, queueArchive, archiveUpdate } =
      build();
    queueArchive();
    fetcher.expandArchive.mockImplementation(
      async (
        _batchId: string,
        _key: string,
        _remaining: number,
        onEntry: ArchiveEntrySink,
      ): Promise<ExpandedArchive> => {
        await onEntry(entry('01.mp3', 'music/portal/b1/a.mp3'));
        await onEntry(entry('02.mp3', 'music/portal/b1/b.mp3'));
        // Обрыв базы, таймаут транзакции, падение процесса — что угодно
        // после того, как объекты уже легли в бакет.
        throw new Error('соединение с базой оборвалось');
      },
    );

    await service.processOnce();

    expect(prisma.musicIngestItem.create).toHaveBeenCalledTimes(2);
    // Позиция архива больше не возвращается в `waiting`: вторая распаковка
    // залила бы те же записи новыми ключами, а первый комплект остался бы
    // сиротами — уборка партии их уже не найдёт.
    expect(archiveUpdate()?.data).toMatchObject({
      status: 'skipped',
      failureReason: 'Разбор прерван: в партию заведено записей 2',
      storageKey: null,
    });
    expect(storage.remove).toHaveBeenCalledWith('music/portal/b1/album.zip');
  });

  it('сбой до первой записи оставляет архив на повтор', async () => {
    const { prisma, fetcher, service, queueArchive, archiveUpdate } = build();
    queueArchive();
    fetcher.expandArchive.mockRejectedValue(
      new IngestFetchError('unreachable', 'Архив не читается из хранилища'),
    );

    await service.processOnce();

    expect(prisma.musicIngestItem.create).not.toHaveBeenCalled();
    // Ничего не залито — терять нечего, и следующая попытка законна.
    expect(archiveUpdate()?.data).toMatchObject({
      status: 'waiting',
      failureReason: 'Архив не читается из хранилища',
    });
  });

  it('потолок партии на середине архива оставляет уже вынутое', async () => {
    const { prisma, fetcher, service, queueArchive, archiveUpdate } = build();
    queueArchive();
    fetcher.expandArchive.mockImplementation(
      async (
        _batchId: string,
        _key: string,
        _remaining: number,
        onEntry: ArchiveEntrySink,
      ): Promise<ExpandedArchive> => {
        await onEntry(entry('01.mp3', 'music/portal/b1/a.mp3'));
        return {
          takenCount: 1,
          truncatedReason:
            'Взято записей: 1. Дальше партия упёрлась в потолок 20 ГБ',
        };
      },
    );

    await service.processOnce();

    expect(prisma.musicIngestItem.create).toHaveBeenCalledTimes(1);
    expect(archiveUpdate()?.data).toMatchObject({
      status: 'skipped',
      failureReason:
        'Взято записей: 1. Дальше партия упёрлась в потолок 20 ГБ',
    });
  });

  it('в партию не влезла ни одна запись — позиция падает с той же причиной', async () => {
    const { prisma, fetcher, service, queueArchive, archiveUpdate } = build();
    queueArchive();
    fetcher.expandArchive.mockResolvedValue({
      takenCount: 0,
      truncatedReason:
        'Партия упёрлась в потолок 20 ГБ — не поместилась ни одна запись архива',
    } satisfies ExpandedArchive);

    await service.processOnce();

    expect(prisma.musicIngestItem.create).not.toHaveBeenCalled();
    // Не «в архиве нет mp3»: записи там есть, места нет в партии.
    expect(archiveUpdate()?.data).toMatchObject({
      status: 'failed',
      failureReason:
        'Партия упёрлась в потолок 20 ГБ — не поместилась ни одна запись архива',
    });
  });
});
