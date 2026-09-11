import {
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LibraryFilesService } from './library-files.service';

const ENTRY = 'entry-1';
const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const KEY = `library/books/${ENTRY}/${UUID}.pdf`;
const NOW = new Date('2026-09-11T10:00:00.000Z');
const MB = 1024 * 1024;

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
}

function setup({
  owner = 'user-1',
  status = 'published',
  filesCount = 0,
  configured = true,
  head = { sizeBytes: 2048 },
}: SetupOptions = {}) {
  const prisma = {
    libraryEntry: {
      findUnique: jest.fn().mockResolvedValue({
        status,
        addedById: owner,
        _count: { files: filesCount },
      }),
    },
    libraryEntryFile: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'file-1', createdAt: NOW, ...args.data }),
      ),
      delete: jest.fn().mockResolvedValue(undefined),
    },
  };
  const storage = {
    configured,
    presignPut: jest.fn().mockResolvedValue('https://s3.example/put'),
    head: jest.fn().mockResolvedValue(head),
    signedGet: jest.fn().mockResolvedValue('https://s3.example/get'),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const service = new LibraryFilesService(prisma as never, storage as never);
  return { prisma, storage, service };
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
    const { service, prisma, storage } = setup();

    const result = await service.complete('user-1', false, ENTRY, {
      key: KEY,
      fileName: 'C:\\Книги\\Гита.PDF',
    });

    expect(prisma.libraryEntryFile.create).toHaveBeenCalledWith({
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
    const { service, prisma } = setup({ head: null });

    await expect(
      service.complete('user-1', false, ENTRY, { key: KEY, fileName: 'a.pdf' }),
    ).rejects.toThrow('book_file_missing');
    expect(prisma.libraryEntryFile.create).not.toHaveBeenCalled();
  });

  it('повторное завершение отдаёт уже прикреплённый файл', async () => {
    const { service, prisma } = setup();
    prisma.libraryEntryFile.findUnique.mockResolvedValue(fileRow());

    const result = await service.complete('user-1', false, ENTRY, {
      key: KEY,
      fileName: 'a.pdf',
    });

    expect(result.id).toBe('file-1');
    expect(prisma.libraryEntryFile.create).not.toHaveBeenCalled();
  });

  it('слишком большой объект убирается из бакета', async () => {
    const { service, storage } = setup({ head: { sizeBytes: 100 * MB + 1 } });

    await expect(
      service.complete('user-1', false, ENTRY, { key: KEY, fileName: 'a.pdf' }),
    ).rejects.toThrow('book_file_too_large');
    expect(storage.remove).toHaveBeenCalledWith(KEY);
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
});
