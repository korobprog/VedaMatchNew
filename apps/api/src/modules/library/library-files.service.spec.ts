import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isMissingObject } from './library-book-storage.service';
import { LibraryFilesService } from './library-files.service';

const ENTRY = 'entry-1';
const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const KEY = `library/books/${ENTRY}/${UUID}.pdf`;
const NOW = new Date('2026-09-11T10:00:00.000Z');
const MB = 1024 * 1024;
const PDF = new Uint8Array(Buffer.from('%PDF-1.7\n', 'latin1'));

function fileRow(over: Record<string, unknown> = {}) {
  return {
    id: 'file-1',
    entryId: ENTRY,
    storageKey: KEY,
    name: 'Гита.pdf',
    format: 'pdf',
    sizeBytes: 2048,
    createdAt: NOW,
    ...over,
  };
}

interface SetupOptions {
  owner?: string;
  status?: string;
  filesCount?: number;
  configured?: boolean;
  /** `null` — объекта в бакете нет: браузер так и не долил файл. */
  head?: { sizeBytes: number } | null;
  /** Сколько файлов увидит счёт под замком — может отличаться от первого. */
  lockedCount?: number;
  content?: Uint8Array;
}

function setup({
  owner = 'user-1',
  status = 'published',
  filesCount = 0,
  configured = true,
  head = { sizeBytes: 2048 },
  lockedCount = filesCount,
  content = PDF,
}: SetupOptions = {}) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: ENTRY }]),
    libraryEntryFile: {
      count: jest.fn().mockResolvedValue(lockedCount),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'file-1', createdAt: NOW, ...args.data }),
      ),
    },
  };
  const prisma = {
    libraryEntry: {
      findUnique: jest.fn().mockResolvedValue({
        status,
        addedById: owner,
        titleRu: 'Гита как она есть',
        titleEn: null,
        url: null,
        _count: { files: filesCount },
      }),
    },
    libraryEntryFile: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
    },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const storage = {
    configured,
    presignPut: jest.fn().mockResolvedValue('https://s3.example/put'),
    head: jest.fn().mockResolvedValue(head),
    readHead: jest.fn().mockResolvedValue(content),
    signedGet: jest.fn().mockResolvedValue('https://s3.example/get'),
    remove: jest.fn().mockResolvedValue(true),
  };
  const events = { emit: jest.fn() };
  const service = new LibraryFilesService(
    prisma as never,
    storage as never,
    events as never,
  );
  return { prisma, tx, storage, events, service };
}

describe('LibraryFilesService.createUpload', () => {
  it('выдаёт ссылку под ключом записи и с типом по формату', async () => {
    const { service, storage } = setup();

    const result = await service.createUpload('user-1', false, ENTRY, {
      fileName: 'scan.djv',
      sizeBytes: 5000,
    });

    expect(result.key).toMatch(
      /^library\/books\/entry-1\/[0-9a-f-]{36}\.djvu$/,
    );
    // Тип берёт сервер: браузер для djvu шлёт пустую строку, а тип входит
    // в подпись ссылки.
    expect(result.headers).toEqual({ 'Content-Type': 'image/vnd.djvu' });
    expect(storage.presignPut).toHaveBeenCalledWith(
      result.key,
      'image/vnd.djvu',
      5000,
    );
  });

  it('без хранилища отвечает 503 и в базу не ходит', async () => {
    const { service, prisma } = setup({ configured: false });

    await expect(
      service.createUpload('user-1', false, ENTRY, {
        fileName: 'a.pdf',
        sizeBytes: 10,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.libraryEntry.findUnique).not.toHaveBeenCalled();
  });

  it('к чужому материалу прикрепляет только админ', async () => {
    const body = { fileName: 'a.pdf', sizeBytes: 10 };

    await expect(
      setup({ owner: 'user-2' }).service.createUpload(
        'user-1',
        false,
        ENTRY,
        body,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      setup({ owner: 'user-2' }).service.createUpload(
        'user-1',
        true,
        ENTRY,
        body,
      ),
    ).resolves.toMatchObject({ url: 'https://s3.example/put' });
  });

  it('к скрытому жалобами материалу не прикрепить — как нет и его страницы', async () => {
    await expect(
      setup({ status: 'hidden_by_reports' }).service.createUpload(
        'user-1',
        false,
        ENTRY,
        { fileName: 'a.pdf', sizeBytes: 10 },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('не принимает не книгу и шестой файл', async () => {
    await expect(
      setup().service.createUpload('user-1', false, ENTRY, {
        fileName: 'setup.exe',
        sizeBytes: 10,
      }),
    ).rejects.toThrow('unsupported_book_format');
    await expect(
      setup({ filesCount: 5 }).service.createUpload('user-1', false, ENTRY, {
        fileName: 'a.pdf',
        sizeBytes: 10,
      }),
    ).rejects.toThrow('too_many_book_files');
  });
});

describe('LibraryFilesService.complete', () => {
  it('сверяет объект и прикрепляет файл с очищенным именем', async () => {
    const { service, tx, storage } = setup();

    const result = await service.complete('user-1', false, ENTRY, {
      key: KEY,
      fileName: 'C:\\Книги\\Гита.PDF',
    });

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.libraryEntryFile.create).toHaveBeenCalledWith({
      data: {
        entryId: ENTRY,
        storageKey: KEY,
        name: 'Гита.pdf',
        format: 'pdf',
        // Размер — из бакета, а не из заявки.
        sizeBytes: 2048,
        addedById: 'user-1',
      },
    });
    expect(result).toMatchObject({
      name: 'Гита.pdf',
      url: 'https://s3.example/get',
    });
    expect(storage.signedGet).toHaveBeenCalledWith(
      KEY,
      expect.stringMatching(/^inline;/),
      'application/pdf',
    );
  });

  it('чужой ключ к материалу не привязать', async () => {
    const { service, storage } = setup();

    await expect(
      service.complete('user-1', false, ENTRY, {
        key: `music/u1/${UUID}.mp3`,
        fileName: 'a.pdf',
      }),
    ).rejects.toThrow('book_key_mismatch');
    expect(storage.head).not.toHaveBeenCalled();
  });

  it('не долитый файл не прикрепляется', async () => {
    const { service, tx } = setup({ head: null });

    await expect(
      service.complete('user-1', false, ENTRY, { key: KEY, fileName: 'a.pdf' }),
    ).rejects.toThrow('book_file_missing');
    expect(tx.libraryEntryFile.create).not.toHaveBeenCalled();
  });

  it('повторное завершение отдаёт уже прикреплённый файл', async () => {
    const { service, prisma, tx, storage } = setup();
    prisma.libraryEntryFile.findUnique.mockResolvedValue(fileRow());

    const result = await service.complete('user-1', false, ENTRY, {
      key: KEY,
      fileName: 'a.pdf',
    });

    expect(result.id).toBe('file-1');
    expect(tx.libraryEntryFile.create).not.toHaveBeenCalled();
    expect(storage.head).not.toHaveBeenCalled();
  });

  it('параллельный повтор не падает, а отдаёт файл победителя', async () => {
    const { service, prisma, tx } = setup();
    tx.libraryEntryFile.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.libraryEntryFile.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(fileRow());

    await expect(
      service.complete('user-1', false, ENTRY, { key: KEY, fileName: 'a.pdf' }),
    ).resolves.toMatchObject({ id: 'file-1' });
  });

  it('прочую ошибку базы не глотает', async () => {
    const { service, tx } = setup();
    tx.libraryEntryFile.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.complete('user-1', false, ENTRY, { key: KEY, fileName: 'a.pdf' }),
    ).rejects.toThrow('db down');
  });

  it('сбой хранилища не выдаёт за «файл не залит»', async () => {
    const { service, storage, tx } = setup();
    storage.head.mockRejectedValue(
      new ServiceUnavailableException('book_storage_unavailable'),
    );

    await expect(
      service.complete('user-1', false, ENTRY, { key: KEY, fileName: 'a.pdf' }),
    ).rejects.toThrow('book_storage_unavailable');
    expect(storage.remove).not.toHaveBeenCalled();
    expect(tx.libraryEntryFile.create).not.toHaveBeenCalled();
  });

  it.each([
    ['пустой файл', { head: { sizeBytes: 0 } }, 'book_file_empty'],
    [
      'файл больше предела',
      { head: { sizeBytes: 100 * MB + 1 } },
      'book_file_too_large',
    ],
    [
      'страницу под видом pdf',
      { content: new Uint8Array(Buffer.from('<!doctype html>')) },
      'book_file_content_mismatch',
    ],
  ])('%s отбивает и убирает из бакета', async (_name, options, reason) => {
    const { service, storage, tx } = setup(options);

    await expect(
      service.complete('user-1', false, ENTRY, { key: KEY, fileName: 'a.pdf' }),
    ).rejects.toThrow(reason);
    await expect(
      service.complete('user-1', false, ENTRY, { key: KEY, fileName: 'a.pdf' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.remove).toHaveBeenCalledWith(KEY);
    expect(tx.libraryEntryFile.create).not.toHaveBeenCalled();
  });

  it('предел файлов держит и тогда, когда соседняя заливка успела раньше', async () => {
    // Первый счёт видел четыре, под замком их уже пять.
    const { service, storage, tx, events } = setup({
      filesCount: 4,
      lockedCount: 5,
    });

    await expect(
      service.complete('user-1', false, ENTRY, { key: KEY, fileName: 'a.pdf' }),
    ).rejects.toThrow('too_many_book_files');
    expect(tx.libraryEntryFile.create).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith(KEY);
    expect(events.emit).not.toHaveBeenCalled();
  });

  describe('журнал аудита', () => {
    const body = { key: KEY, fileName: 'Гита.pdf' };

    it('админ над чужим материалом — пишется', async () => {
      const { service, events } = setup({ owner: 'user-2' });

      await service.complete('admin-1', true, ENTRY, body);

      expect(events.emit).toHaveBeenCalledWith('admin.action', {
        actorId: 'admin-1',
        action: 'library.file-added',
        targetType: 'platform',
        targetId: ENTRY,
        details: {
          entry: 'Гита как она есть',
          file: 'Гита.pdf',
          format: 'pdf',
          sizeBytes: 2048,
        },
      });
    });

    it('автор со своим материалом — не пишется, даже будучи админом', async () => {
      const own = setup({ owner: 'user-1' });
      await own.service.complete('user-1', false, ENTRY, body);
      expect(own.events.emit).not.toHaveBeenCalled();

      const ownAdmin = setup({ owner: 'user-1' });
      await ownAdmin.service.complete('user-1', true, ENTRY, body);
      expect(ownAdmin.events.emit).not.toHaveBeenCalled();
    });

    it('снятие файла админом над чужим материалом — пишется', async () => {
      const { service, prisma, events } = setup({ owner: 'user-2' });
      prisma.libraryEntryFile.findUnique.mockResolvedValue(fileRow());

      await service.remove('admin-1', true, ENTRY, 'file-1');

      expect(events.emit).toHaveBeenCalledWith(
        'admin.action',
        expect.objectContaining({
          action: 'library.file-removed',
          targetId: ENTRY,
        }),
      );
    });

    it('снятие автором своего файла — не пишется', async () => {
      const { service, prisma, events } = setup({ owner: 'user-1' });
      prisma.libraryEntryFile.findUnique.mockResolvedValue(fileRow());

      await service.remove('user-1', false, ENTRY, 'file-1');

      expect(events.emit).not.toHaveBeenCalled();
    });
  });
});

describe('LibraryFilesService.remove', () => {
  it('удаляет сначала строку, потом объект', async () => {
    const { service, prisma, storage } = setup();
    prisma.libraryEntryFile.findUnique.mockResolvedValue(fileRow());

    await service.remove('user-1', false, ENTRY, 'file-1');

    expect(prisma.libraryEntryFile.delete).toHaveBeenCalledWith({
      where: { id: 'file-1' },
    });
    expect(storage.remove).toHaveBeenCalledWith(KEY);
    expect(
      prisma.libraryEntryFile.delete.mock.invocationCallOrder[0],
    ).toBeLessThan(storage.remove.mock.invocationCallOrder[0]);
  });

  it('файл другого материала — 404', async () => {
    const { service, prisma } = setup();
    prisma.libraryEntryFile.findUnique.mockResolvedValue(
      fileRow({ entryId: 'entry-2' }),
    );

    await expect(
      service.remove('user-1', false, ENTRY, 'file-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.libraryEntryFile.delete).not.toHaveBeenCalled();
  });
});

describe('LibraryFilesService.forEntry', () => {
  it('отдаёт файлы материала с подписанными ссылками', async () => {
    const { service, prisma } = setup();
    prisma.libraryEntryFile.findMany.mockResolvedValue([
      fileRow(),
      fileRow({ id: 'file-2', format: 'epub', name: 'Гита.epub' }),
    ]);

    const files = await service.forEntry(ENTRY);

    expect(files.map((file) => [file.id, file.format, file.url])).toEqual([
      ['file-1', 'pdf', 'https://s3.example/get'],
      ['file-2', 'epub', 'https://s3.example/get'],
    ]);
    expect(files[0].createdAt).toBe(NOW.toISOString());
  });

  it('без хранилища отдаёт пустой список, а не роняет страницу материала', async () => {
    const { service, prisma, storage } = setup({ configured: false });

    await expect(service.forEntry(ENTRY)).resolves.toEqual([]);
    expect(prisma.libraryEntryFile.findMany).not.toHaveBeenCalled();
    expect(storage.signedGet).not.toHaveBeenCalled();
  });
});

describe('isMissingObject', () => {
  it('«нет объекта» — по имени ошибки или коду 404', () => {
    expect(isMissingObject({ name: 'NotFound' })).toBe(true);
    expect(isMissingObject({ name: 'NoSuchKey' })).toBe(true);
    expect(
      isMissingObject({ name: 'Err', $metadata: { httpStatusCode: 404 } }),
    ).toBe(true);
  });

  it('отказ хранилища и не-ошибки «нет объекта» не означают', () => {
    expect(
      isMissingObject({ name: 'Err', $metadata: { httpStatusCode: 503 } }),
    ).toBe(false);
    expect(isMissingObject(new Error('timeout'))).toBe(false);
    expect(isMissingObject(null)).toBe(false);
    expect(isMissingObject('NotFound')).toBe(false);
  });
});
