/* VED-662: файлы книг Библиотеки — завершение заливки, снятие, выдача. */
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { VedabaseFilesService } from './vedabase-files.service';

const BOOK = 'book-1';
const SLUG = 'bhagavad-gita';
const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const KEY = `vedabase/books/${BOOK}/${UUID}.pdf`;
const NOW = new Date('2026-09-30T10:00:00.000Z');
const PDF = new Uint8Array(Buffer.from('%PDF-1.7\n', 'latin1'));

function fileRow(over: Record<string, unknown> = {}) {
  return {
    id: 'file-1',
    bookId: BOOK,
    storageKey: KEY,
    name: 'Гита.pdf',
    format: 'pdf',
    sizeBytes: 2048,
    createdAt: NOW,
    ...over,
  };
}

interface SetupOptions {
  filesCount?: number;
  /** Сколько файлов увидит счёт под замком — может отличаться от первого. */
  lockedCount?: number;
  head?: { sizeBytes: number } | null;
  content?: Uint8Array;
  blocked?: boolean;
}

function setup({
  filesCount = 0,
  lockedCount = filesCount,
  head = { sizeBytes: 2048 },
  content = PDF,
  blocked = false,
}: SetupOptions = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: BOOK }]),
    vedabaseBookFile: {
      count: jest.fn().mockResolvedValue(lockedCount),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'file-1', createdAt: NOW, ...args.data }),
      ),
    },
  };
  const prisma = {
    vedabaseBook: {
      findUnique: jest.fn().mockResolvedValue({
        id: BOOK,
        title: 'Бхагавад-гита',
        blocked,
        _count: { files: filesCount },
      }),
    },
    vedabaseBookFile: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([fileRow()]),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const storage = {
    configured: true,
    presignPut: jest.fn().mockResolvedValue('https://s3.example/put'),
    head: jest.fn().mockResolvedValue(head),
    readHead: jest.fn().mockResolvedValue(content),
    signedGet: jest.fn().mockResolvedValue('https://s3.example/get'),
    remove: jest.fn().mockResolvedValue(true),
  };
  const events = { emit: jest.fn() };
  const service = new VedabaseFilesService(
    prisma as never,
    storage as never,
    events as never,
  );
  return { prisma, tx, storage, events, service };
}

const complete = (service: VedabaseFilesService, key: unknown = KEY) =>
  service.complete('admin-1', SLUG, {
    key: key as string,
    fileName: 'Гита.pdf',
  });

describe('VedabaseFilesService.complete', () => {
  it('прикрепляет файл под замком книги и пишет в журнал', async () => {
    const { service, tx, events } = setup();

    const file = await complete(service);

    expect(file).toMatchObject({ name: 'Гита.pdf', format: 'pdf' });
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.vedabaseBookFile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookId: BOOK,
        storageKey: KEY,
        sizeBytes: 2048,
        addedById: 'admin-1',
      }) as unknown,
    });
    expect(events.emit).toHaveBeenCalledWith('admin.action', {
      actorId: 'admin-1',
      action: 'vedabase.file-added',
      targetType: 'platform',
      targetId: SLUG,
      details: {
        book: 'Бхагавад-гита',
        file: 'Гита.pdf',
        format: 'pdf',
        sizeBytes: 2048,
      },
    });
  });

  it('чужой ключ не принимает и в бакет не ходит', async () => {
    const { service, storage } = setup();

    await expect(complete(service, `music/covers/${UUID}.pdf`)).rejects.toThrow(
      'book_key_mismatch',
    );
    expect(storage.head).not.toHaveBeenCalled();
  });

  it('повтор с тем же ключом отдаёт прикреплённый файл', async () => {
    const { service, prisma, storage, events } = setup();
    prisma.vedabaseBookFile.findUnique.mockResolvedValue(fileRow());

    await expect(complete(service)).resolves.toMatchObject({ id: 'file-1' });
    expect(storage.head).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('параллельный повтор не падает, а отдаёт файл победителя', async () => {
    const { service, prisma, tx, events } = setup();
    tx.vedabaseBookFile.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.vedabaseBookFile.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(fileRow());

    await expect(complete(service)).resolves.toMatchObject({ id: 'file-1' });
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('прочую ошибку базы не глотает', async () => {
    const { service, tx } = setup();
    tx.vedabaseBookFile.create.mockRejectedValue(new Error('db down'));

    await expect(complete(service)).rejects.toThrow('db down');
  });

  it('объекта нет — файл не залит', async () => {
    const { service, storage } = setup({ head: null });

    await expect(complete(service)).rejects.toThrow('book_file_missing');
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('сбой хранилища не выдаёт за «файл не залит»', async () => {
    const { service, storage, tx } = setup();
    storage.head.mockRejectedValue(
      new ServiceUnavailableException('book_storage_unavailable'),
    );

    await expect(complete(service)).rejects.toThrow('book_storage_unavailable');
    expect(storage.remove).not.toHaveBeenCalled();
    expect(tx.vedabaseBookFile.create).not.toHaveBeenCalled();
  });

  it.each([
    ['пустой файл', { head: { sizeBytes: 0 } }, 'book_file_empty'],
    [
      'файл больше предела',
      { head: { sizeBytes: 101 * 1024 * 1024 } },
      'book_file_too_large',
    ],
    [
      'страницу под видом pdf',
      { content: new Uint8Array(Buffer.from('<!doctype html>')) },
      'book_file_content_mismatch',
    ],
  ])('%s отбивает и убирает из бакета', async (_name, options, reason) => {
    const { service, storage, tx } = setup(options);

    await expect(complete(service)).rejects.toThrow(reason);
    await expect(complete(service)).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.remove).toHaveBeenCalledWith(KEY);
    expect(tx.vedabaseBookFile.create).not.toHaveBeenCalled();
  });

  it('предел файлов держит и тогда, когда соседняя заливка успела раньше', async () => {
    // Первый счёт видел девять, под замком их уже десять.
    const { service, storage, tx, events } = setup({
      filesCount: 9,
      lockedCount: 10,
    });

    await expect(complete(service)).rejects.toThrow('too_many_book_files');
    expect(tx.vedabaseBookFile.create).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith(KEY);
    expect(events.emit).not.toHaveBeenCalled();
  });
});

describe('VedabaseFilesService.remove', () => {
  it('снимает файл, убирает объект и пишет в журнал', async () => {
    const { service, prisma, storage, events } = setup();
    prisma.vedabaseBookFile.findUnique.mockResolvedValue(fileRow());

    await service.remove('admin-1', SLUG, 'file-1');

    expect(prisma.vedabaseBookFile.delete).toHaveBeenCalledWith({
      where: { id: 'file-1' },
    });
    expect(storage.remove).toHaveBeenCalledWith(KEY);
    expect(events.emit).toHaveBeenCalledWith(
      'admin.action',
      expect.objectContaining({
        action: 'vedabase.file-removed',
        targetId: SLUG,
        details: expect.objectContaining({ file: 'Гита.pdf' }) as unknown,
      }),
    );
  });

  it('файл чужой книги не трогает', async () => {
    const { service, prisma, storage, events } = setup();
    prisma.vedabaseBookFile.findUnique.mockResolvedValue(
      fileRow({ bookId: 'book-2' }),
    );

    await expect(
      service.remove('admin-1', SLUG, 'file-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.vedabaseBookFile.delete).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});

describe('VedabaseFilesService.forBook', () => {
  it('читателю заблокированную книгу не отдаёт, админу — отдаёт', async () => {
    const { service } = setup({ blocked: true });

    await expect(
      service.forBook(SLUG, { includeBlocked: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.forBook(SLUG, { includeBlocked: true }),
    ).resolves.toHaveLength(1);
  });

  it('без хранилища отвечает отказом, а не пустой ссылкой', async () => {
    const { service, storage } = setup();
    storage.signedGet.mockRejectedValue(
      new ServiceUnavailableException('book_storage_unavailable'),
    );

    await expect(
      service.forBook(SLUG, { includeBlocked: false }),
    ).rejects.toThrow('book_storage_unavailable');
  });
});
