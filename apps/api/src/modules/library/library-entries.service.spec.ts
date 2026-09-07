import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { LibraryEntriesService } from './library-entries.service';

const NOW = new Date('2026-07-29T10:00:00.000Z');

function entryRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    url: 'https://example.com/a',
    domain: 'example.com',
    type: 'article',
    contentLanguage: 'ru',
    titleRu: 'Статья',
    titleEn: null,
    descriptionRu: null,
    descriptionEn: null,
    faviconUrl: null,
    previewUrl: null,
    previewIsCustom: false,
    source: null,
    status: 'published',
    usefulCount: 0,
    uniqueClickCount: 0,
    bookmarkCount: 0,
    commentsCount: 0,
    publishedAt: NOW,
    addedBy: { id: 'user-1', name: 'Тест' },
    community: null,
    lineage: 'iskcon',
    categories: [],
    ...overrides,
  };
}

/** Что вернул последний вызов jest-мока. */
type CallResult = { value?: Promise<unknown> } | undefined;

function prismaMock(overrides: Record<string, unknown> = {}) {
  const libraryEntry = {
    findUnique: jest.fn().mockResolvedValue(null),
    findUniqueOrThrow: jest
      .fn()
      .mockResolvedValue({ urlNormalized: 'https://example.com/a' }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue(entryRecord()),
    update: jest.fn().mockResolvedValue(entryRecord()),
    // Список общин для фильтра считается через groupBy по самим записям.
    groupBy: jest.fn().mockResolvedValue([]),
  };
  return {
    libraryEntry,
    // Портальная модель, доступная сервису на чтение: из неё берётся подпись
    // общины. Заведена здесь, а не дописывается в тестах: дописанное свойство
    // не проходит проверку типов, и `tsc` со спеками падал бы на нём.
    community: { findMany: jest.fn().mockResolvedValue([]) },
    // Этап и линия человека — ради линии материала и фильтра ленты. По
    // умолчанию человека нет: линия падает в ISKCON, лента не фильтруется.
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    libraryPreference: { findUnique: jest.fn().mockResolvedValue(null) },
    libraryCategory: {
      findMany: jest.fn().mockResolvedValue([{ id: 'category-1' }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    libraryEntryCategory: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback({
        libraryEntry: {
          ...libraryEntry,
          // Создание перечитывает запись в той же транзакции, чтобы вернуть
          // её вместе с категориями. Отдаём то же, что отдал `create`:
          // тесты подменяют именно его.
          findUniqueOrThrow: jest.fn(() => {
            const last = libraryEntry.create.mock.results.at(-1) as CallResult;
            return last?.value ?? Promise.resolve(entryRecord());
          }),
        },
        libraryEntryCategory: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        libraryCategory: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      }),
    ),
    $queryRaw: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function bookmarksMock() {
  return {
    markedAmong: jest.fn().mockResolvedValue(new Set<string>()),
    entryIds: jest.fn().mockResolvedValue([]),
  };
}

function eventsMock() {
  return { emit: jest.fn() };
}

function previewsMock(overrides: Record<string, unknown> = {}) {
  return {
    configured: true,
    capture: jest.fn().mockResolvedValue(undefined),
    captureInBackground: jest.fn(),
    remove: jest.fn().mockResolvedValue(undefined),
    storeBuffer: jest.fn().mockResolvedValue({
      key: 'library/previews/entry-1.webp',
      url: 'https://cdn.vedamatch.ru/library/previews/entry-1.webp',
    }),
    ...overrides,
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    url: 'https://example.com/a',
    type: 'article' as const,
    contentLanguage: 'ru',
    titleRu: 'Статья',
    categoryIds: ['category-1'],
    ...overrides,
  };
}

/** Сервису записей от рубрик нужен только список поддерева для фильтра. */
function categoriesMock() {
  return { subtreeIds: jest.fn().mockResolvedValue(['category-1']) };
}

/**
 * От справочника общин сервису нужно одно: можно ли этому человеку писать от
 * имени общины. По умолчанию — можно; тесты про отказ переопределяют.
 */
function communitiesMock(canPostAs = true) {
  return { canPostAs: jest.fn().mockResolvedValue(canPostAs) };
}

describe('LibraryEntriesService.create', () => {
  it('rejects an overlong url before database access', async () => {
    const prisma = prismaMock();
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await expect(
      service.create(
        'user-1',
        validBody({ url: `https://example.com/${'a'.repeat(2000)}` }),
      ),
    ).rejects.toMatchObject({ response: { message: 'url_too_long' } });
    expect(prisma.libraryEntry.findUnique).not.toHaveBeenCalled();
  });

  it('возвращает созданную запись вместе с выбранными категориями', async () => {
    // Связи заводятся после `create`, и запись из него приходила с пустым
    // `categories`: карточка в ответе выглядела так, будто категории
    // потерялись.
    const prisma = prismaMock();
    prisma.libraryEntry.create = jest.fn().mockResolvedValue(
      entryRecord({
        categories: [
          {
            category: {
              id: 'category-1',
              slug: 'lekcii',
              titleRu: 'Лекции и видео',
              titleEn: 'Lectures and video',
            },
          },
        ],
      }),
    );
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    const created = await service.create('user-1', validBody());

    expect(created.categories).toEqual([
      {
        id: 'category-1',
        slug: 'lekcii',
        titleRu: 'Лекции и видео',
        titleEn: 'Lectures and video',
      },
    ]);
  });

  it('rejects an unsupported url', async () => {
    const service = new LibraryEntriesService(
      prismaMock() as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await expect(
      service.create('user-1', validBody({ url: 'ftp://example.com' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires at least one title', async () => {
    const service = new LibraryEntriesService(
      prismaMock() as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await expect(
      service.create('user-1', validBody({ titleRu: null, titleEn: null })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires at least one category', async () => {
    const service = new LibraryEntriesService(
      prismaMock() as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await expect(
      service.create('user-1', validBody({ categoryIds: [] })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 409 with the existing entry for a duplicate url', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest
      .fn()
      .mockResolvedValue(entryRecord({ id: 'existing' }));
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await expect(
      service.create(
        'user-1',
        validBody({ url: 'https://WWW.example.com/a/?utm_source=x' }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        code: 'entry_already_exists',
        entry: expect.objectContaining({ id: 'existing' }) as object,
      },
    });
  });

  it('stores the normalized url and domain', async () => {
    const prisma = prismaMock();
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await service.create(
      'user-1',
      validBody({ url: 'https://WWW.Example.com/a/?utm_source=x' }),
    );

    const createCalls = prisma.libraryEntry.create.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    const { data } = createCalls[0][0];
    expect(data.urlNormalized).toBe('https://example.com/a');
    expect(data.domain).toBe('example.com');
    expect(data.url).toBe('https://WWW.Example.com/a/?utm_source=x');
    expect(data.addedById).toBe('user-1');
    expect(data.enrichmentStatus).toBe('pending');
  });

  it('stores a source-only entry without touching the url columns', async () => {
    const prisma = prismaMock();
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await service.create(
      'user-1',
      validBody({ url: null, source: 'Бхагавад-гита 9.22' }),
    );

    const createCalls = prisma.libraryEntry.create.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    const { data } = createCalls[0][0];
    expect(data.url).toBeNull();
    expect(data.urlNormalized).toBeNull();
    expect(data.domain).toBeNull();
    expect(data.source).toBe('Бхагавад-гита 9.22');
    // Обогащать нечего — иначе запись висела бы «pending» вечно.
    expect(data.enrichmentStatus).toBe('not_applicable');
  });

  it('does not look for duplicates when there is no url', async () => {
    const prisma = prismaMock();
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await service.create(
      'user-1',
      validBody({ url: null, source: 'Бхагавад-гита 9.22' }),
    );

    // Один источник законно стоит у множества материалов — ключа для
    // дедупликации у таких записей нет.
    expect(prisma.libraryEntry.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an entry with neither url nor source', async () => {
    const prisma = prismaMock();
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await expect(
      service.create('user-1', validBody({ url: null, source: null })),
    ).rejects.toThrow('url_or_source_required');
  });

  it('stores a youtube cover taken from the link itself', async () => {
    const prisma = prismaMock();
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await service.create(
      'user-1',
      validBody({
        url: 'https://www.youtube.com/watch?v=OXDrvBwIHLg',
        type: 'video' as const,
      }),
    );

    const createCalls = prisma.libraryEntry.create.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(createCalls[0][0].data.previewUrl).toBe(
      'https://i.ytimg.com/vi/OXDrvBwIHLg/hqdefault.jpg',
    );
  });

  it('hands the cover over to S3 after the entry is stored', async () => {
    const prisma = prismaMock();
    const previews = previewsMock();
    const service = new LibraryEntriesService(
      prisma as never,
      previews as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await service.create(
      'user-1',
      validBody({
        url: 'https://www.youtube.com/watch?v=OXDrvBwIHLg',
        type: 'video' as const,
      }),
    );

    expect(previews.captureInBackground).toHaveBeenCalledWith(
      'entry-1',
      'https://www.youtube.com/watch?v=OXDrvBwIHLg',
      'https://i.ytimg.com/vi/OXDrvBwIHLg/hqdefault.jpg',
    );
  });

  it('leaves S3 alone when the link has no cover', async () => {
    const previews = previewsMock();
    const service = new LibraryEntriesService(
      prismaMock() as never,
      previews as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await service.create('user-1', validBody());

    expect(previews.captureInBackground).not.toHaveBeenCalled();
  });

  it('rejects category ids that do not exist', async () => {
    const prisma = prismaMock();
    prisma.libraryCategory.findMany = jest.fn().mockResolvedValue([]);
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await expect(service.create('user-1', validBody())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('LibraryEntriesService.feed', () => {
  it('filters published entries by type and language', async () => {
    const prisma = prismaMock();
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await service.feed({ type: 'video', language: 'en' });

    const findManyCalls = prisma.libraryEntry.findMany.mock.calls as Array<
      [{ where: Record<string, unknown>; take: number }]
    >;
    const args = findManyCalls[0][0];
    expect(args.where).toMatchObject({
      status: 'published',
      type: 'video',
      contentLanguage: 'en',
    });
    expect(args.take).toBe(21);
  });

  it('returns nextCursor only when a full page was fetched', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findMany = jest
      .fn()
      .mockResolvedValue(
        Array.from({ length: 21 }, (_, index) =>
          entryRecord({ id: `entry-${index}` }),
        ),
      );
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    const result = await service.feed({});

    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).not.toBeNull();
  });

  it('ignores a broken cursor instead of failing', async () => {
    const prisma = prismaMock();
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    const result = await service.feed({ cursor: 'garbage' });

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });
});

describe('LibraryEntriesService canEdit', () => {
  it('marks an entry as editable for its author', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest
      .fn()
      .mockResolvedValue(entryRecord({ addedBy: { id: 'user-1', name: 'X' } }));
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    const result = await service.byId('entry-1', 'user-1');

    expect(result.canEdit).toBe(true);
  });

  it('marks an entry as read-only for someone else', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest
      .fn()
      .mockResolvedValue(entryRecord({ addedBy: { id: 'user-1', name: 'X' } }));
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    const result = await service.byId('entry-1', 'someone-else');

    expect(result.canEdit).toBe(false);
  });

  it('marks an entry as editable for an admin regardless of author', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest
      .fn()
      .mockResolvedValue(entryRecord({ addedBy: { id: 'user-1', name: 'X' } }));
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    const result = await service.byId('entry-1', 'admin-1', true);

    expect(result.canEdit).toBe(true);
  });
});

describe('LibraryEntriesService.update', () => {
  /**
   * Данные единственного `update` внутри транзакции. У jest-мока они `any`,
   * поэтому форма записывается здесь один раз, а не в каждой проверке.
   */
  function updateData(update: jest.Mock): Record<string, unknown> {
    const calls = update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    return calls[0][0].data;
  }

  function txMock(updatedEntry: Record<string, unknown>) {
    return {
      libraryEntry: {
        update: jest.fn().mockResolvedValue(undefined),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updatedEntry),
      },
      libraryEntryCategory: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      libraryCategory: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
  }

  it('lets the author edit the title of their own entry', async () => {
    const updated = entryRecord({ titleRu: 'Новый заголовок' });
    const tx = txMock(updated);
    const prisma = prismaMock({
      $transaction: jest.fn((callback: (t: unknown) => unknown) =>
        callback(tx),
      ),
    });
    prisma.libraryEntry.findUnique = jest.fn().mockResolvedValue(entryRecord());
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    const result = await service.update('user-1', false, 'entry-1', {
      titleRu: 'Новый заголовок',
    });

    expect(result.titleRu).toBe('Новый заголовок');
    expect(tx.libraryEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { titleRu: 'Новый заголовок', titleEn: null },
    });
  });

  it('rewrites the url and drops everything read from the old address', async () => {
    const updated = entryRecord({ url: 'https://example.com/b' });
    const tx = txMock(updated);
    const prisma = prismaMock({
      $transaction: jest.fn((callback: (t: unknown) => unknown) =>
        callback(tx),
      ),
    });
    prisma.libraryEntry.findUnique = jest.fn().mockResolvedValue(null);
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );
    // Первый findUnique — сама запись, второй — поиск дубля по новому адресу.
    prisma.libraryEntry.findUnique = jest
      .fn()
      .mockResolvedValueOnce(entryRecord())
      .mockResolvedValueOnce(null);

    await service.update('user-1', false, 'entry-1', {
      url: 'https://example.com/b',
    });

    const data = updateData(tx.libraryEntry.update);
    expect(data.url).toBe('https://example.com/b');
    expect(data.domain).toBe('example.com');
    expect(data.enrichmentStatus).toBe('pending');
    // Заголовок и фавиконка прежнего источника к новой ссылке отношения
    // не имеют — иначе карточка врёт.
    expect(data.ogTitle).toBeNull();
    expect(data.faviconUrl).toBeNull();
    expect(data.previewKey).toBeNull();
  });

  it('leaves enrichment alone when the url did not actually change', async () => {
    const tx = txMock(entryRecord());
    const prisma = prismaMock({
      $transaction: jest.fn((callback: (t: unknown) => unknown) =>
        callback(tx),
      ),
    });
    prisma.libraryEntry.findUnique = jest.fn().mockResolvedValue(entryRecord());
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    // Форма шлёт адрес при каждом сохранении, поэтому «тот же адрес» —
    // рядовой случай, а не редкость: обложку он сбрасывать не должен.
    await service.update('user-1', false, 'entry-1', {
      url: 'https://example.com/a',
      titleRu: 'Другой заголовок',
    });

    const data = updateData(tx.libraryEntry.update);
    expect(data.enrichmentStatus).toBeUndefined();
    expect(data.previewKey).toBeUndefined();
  });

  it('refuses a url that another entry already occupies', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest
      .fn()
      .mockResolvedValueOnce(entryRecord())
      .mockResolvedValueOnce(entryRecord({ id: 'entry-2' }));
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await expect(
      service.update('user-1', false, 'entry-1', {
        url: 'https://example.com/b',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses to clear the url of an entry that has no source', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest.fn().mockResolvedValue(entryRecord());
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    // CHECK-ограничение в базе требует одно из двух; поймать это раньше
    // базы — единственный способ ответить человеку словами.
    await expect(
      service.update('user-1', false, 'entry-1', { url: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to let another member edit someone else’s entry', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest
      .fn()
      .mockResolvedValue(entryRecord({ addedBy: { id: 'user-1', name: 'X' } }));
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await expect(
      service.update('someone-else', false, 'entry-1', { titleRu: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an admin edit an entry they did not add', async () => {
    const updated = entryRecord({ titleRu: 'Правка админа' });
    const tx = txMock(updated);
    const prisma = prismaMock({
      $transaction: jest.fn((callback: (t: unknown) => unknown) =>
        callback(tx),
      ),
    });
    prisma.libraryEntry.findUnique = jest
      .fn()
      .mockResolvedValue(entryRecord({ addedBy: { id: 'user-1', name: 'X' } }));
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    const result = await service.update('admin-1', true, 'entry-1', {
      titleRu: 'Правка админа',
    });

    expect(result.titleRu).toBe('Правка админа');
  });

  it('rejects clearing both titles', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest.fn().mockResolvedValue(entryRecord());
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await expect(
      service.update('user-1', false, 'entry-1', {
        titleRu: null,
        titleEn: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('diffs categories instead of replacing them wholesale', async () => {
    const updated = entryRecord();
    const tx = txMock(updated);
    const prisma = prismaMock({
      $transaction: jest.fn((callback: (t: unknown) => unknown) =>
        callback(tx),
      ),
    });
    prisma.libraryEntry.findUnique = jest.fn().mockResolvedValue(
      entryRecord({
        categories: [
          { category: { id: 'category-1', slug: 'a', titleRu: 'A', titleEn: null, section: { slug: 's' } } },
          { category: { id: 'category-2', slug: 'b', titleRu: 'B', titleEn: null, section: { slug: 's' } } },
        ],
      }),
    );
    prisma.libraryCategory.findMany = jest
      .fn()
      .mockResolvedValue([{ id: 'category-1' }, { id: 'category-3' }]);
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await service.update('user-1', false, 'entry-1', {
      categoryIds: ['category-1', 'category-3'],
    });

    expect(tx.libraryEntryCategory.deleteMany).toHaveBeenCalledWith({
      where: { entryId: 'entry-1', categoryId: { in: ['category-2'] } },
    });
    expect(tx.libraryEntryCategory.createMany).toHaveBeenCalledWith({
      data: [{ entryId: 'entry-1', categoryId: 'category-3', addedById: 'user-1' }],
    });
  });
});

describe('LibraryEntriesService.uploadPreview', () => {
  function makeFile(overrides: Record<string, unknown> = {}) {
    return {
      buffer: Buffer.from('fake-image-bytes'),
      mimetype: 'image/png',
      size: 1024,
      ...overrides,
    };
  }

  it('replaces the preview and marks it custom', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest.fn().mockResolvedValue(entryRecord());
    prisma.libraryEntry.update = jest
      .fn()
      .mockResolvedValue(entryRecord({ previewIsCustom: true }));
    const previews = previewsMock();
    const service = new LibraryEntriesService(
      prisma as never,
      previews as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    const result = await service.uploadPreview(
      'user-1',
      false,
      'entry-1',
      makeFile(),
    );

    expect(previews.storeBuffer).toHaveBeenCalledWith(
      'entry-1',
      expect.any(Buffer),
    );
    expect(prisma.libraryEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ previewIsCustom: true }) as object,
      }),
    );
    expect(result.hasCustomPreview).toBe(true);
  });

  it('rejects a file that is not an image', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest.fn().mockResolvedValue(entryRecord());
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await expect(
      service.uploadPreview(
        'user-1',
        false,
        'entry-1',
        makeFile({ mimetype: 'application/pdf' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an upload from someone who is not the author', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest
      .fn()
      .mockResolvedValue(entryRecord({ addedBy: { id: 'user-1', name: 'X' } }));
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await expect(
      service.uploadPreview('someone-else', false, 'entry-1', makeFile()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('LibraryEntriesService.remove', () => {
  function removableRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: 'entry-1',
      addedById: 'user-1',
      status: 'published',
      previewKey: 'library/previews/entry-1.webp',
      categories: [{ categoryId: 'category-1' }],
      ...overrides,
    };
  }

  function txMock() {
    return {
      libraryEntry: { delete: jest.fn().mockResolvedValue(undefined) },
      libraryCategory: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
  }

  it('deletes the author’s own entry and frees its categories', async () => {
    const tx = txMock();
    const prisma = prismaMock({
      $transaction: jest.fn((callback: (t: unknown) => unknown) =>
        callback(tx),
      ),
    });
    prisma.libraryEntry.findUnique = jest
      .fn()
      .mockResolvedValue(removableRecord());
    const previews = previewsMock();
    const service = new LibraryEntriesService(
      prisma as never,
      previews as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await service.remove('user-1', false, 'entry-1');

    expect(tx.libraryEntry.delete).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
    });
    expect(tx.libraryCategory.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['category-1'] } },
      data: { entriesCount: { decrement: 1 } },
    });
    expect(previews.remove).toHaveBeenCalledWith(
      'library/previews/entry-1.webp',
    );
  });

  it('refuses to let another member delete someone else’s entry', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest
      .fn()
      .mockResolvedValue(removableRecord());
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await expect(
      service.remove('someone-else', false, 'entry-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an admin delete an entry they did not add', async () => {
    const tx = txMock();
    const prisma = prismaMock({
      $transaction: jest.fn((callback: (t: unknown) => unknown) =>
        callback(tx),
      ),
    });
    prisma.libraryEntry.findUnique = jest
      .fn()
      .mockResolvedValue(removableRecord());
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await service.remove('admin-1', true, 'entry-1');

    expect(tx.libraryEntry.delete).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
    });
  });

  it('reports a missing entry as not found', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest.fn().mockResolvedValue(null);
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );

    await expect(
      service.remove('user-1', true, 'entry-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('LibraryEntriesService — организационная принадлежность', () => {
  /** Транзакция правки: сервис читает результат через findUniqueOrThrow. */
  function updateTx(updated: Record<string, unknown> = entryRecord()) {
    return {
      libraryEntry: {
        update: jest.fn().mockResolvedValue(undefined),
        findUniqueOrThrow: jest.fn().mockResolvedValue(updated),
      },
      libraryEntryCategory: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      libraryCategory: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
  }

  function build(canPostAs = true, prisma = prismaMock()) {
    const communities = communitiesMock(canPostAs);
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communities as never,
      eventsMock() as never,
    );
    return { service, prisma, communities };
  }

  it('пишет общину, когда право на это есть', async () => {
    const { service, prisma, communities } = build();

    await service.create(
      'user-1',
      validBody({ communityId: 'community-1' }) as never,
    );

    expect(communities.canPostAs).toHaveBeenCalledWith('user-1', 'community-1');
    const create = prisma.libraryEntry.create.mock.calls[0][0] as {
      data: { communityId: string | null };
    };
    expect(create.data.communityId).toBe('community-1');
  });

  it('отказывает, когда права писать от имени общины нет', async () => {
    const { service, prisma } = build(false);

    await expect(
      service.create(
        'user-1',
        validBody({ communityId: 'community-1' }) as never,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.libraryEntry.create).not.toHaveBeenCalled();
  });

  it('без общины справочник не спрашивается вовсе', async () => {
    const { service, communities } = build();

    await service.create('user-1', validBody() as never);

    expect(communities.canPostAs).not.toHaveBeenCalled();
  });

  it('перепроверяет право на правке: роль в общине могли снять', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest
      .fn()
      .mockResolvedValue(entryRecord());
    const { service } = build(false, prisma);

    await expect(
      service.update('user-1', false, 'entry-1', {
        communityId: 'community-1',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.libraryEntry.update).not.toHaveBeenCalled();
  });

  it('не спрашивает право, когда подпись не менялась', async () => {
    const signed = entryRecord({
      community: { id: 'community-1', slug: 'moscow', name: 'Москва' },
    });
    const prisma = prismaMock({
      $transaction: jest.fn((callback: (t: unknown) => unknown) =>
        callback(updateTx(signed)),
      ),
    });
    prisma.libraryEntry.findUnique = jest.fn().mockResolvedValue(signed);
    const { service, communities } = build(false, prisma);

    // Роль в общине сняли, но починить устаревшую подпись можно только
    // правкой — той самой, которую отказ бы и запретил.
    await service.update('user-1', false, 'entry-1', {
      communityId: 'community-1',
      titleRu: 'Другой заголовок',
    } as never);

    expect(communities.canPostAs).not.toHaveBeenCalled();
  });

  it('админ портала правит чужую подписанную карточку', async () => {
    const prisma = prismaMock({
      $transaction: jest.fn((callback: (t: unknown) => unknown) =>
        callback(updateTx()),
      ),
    });
    prisma.libraryEntry.findUnique = jest.fn().mockResolvedValue(entryRecord());
    const { service } = build(false, prisma);

    // Членом чужой общины админ не состоит, а разбирать очередь модерации
    // должен — отказ здесь запирал бы сохранение чужой карточки.
    await expect(
      service.update('admin-1', true, 'entry-1', {
        communityId: 'community-1',
      } as never),
    ).resolves.toBeDefined();
  });

  it('в фильтр попадают только общины с опубликованным, и число — по нему', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.groupBy.mockResolvedValue([
      { communityId: 'community-1', _count: { _all: 3 } },
    ]);
    prisma.community.findMany.mockResolvedValue([
      { id: 'community-1', slug: 'moscow', name: 'Москва' },
    ]);
    const { service } = build(true, prisma);

    const facets = await service.communityFacets();

    // Число считается по записям, а не по связи у общины: иначе рядом с
    // фильтром стояло бы количество, которого он не находит.
    const groupBy = prisma.libraryEntry.groupBy.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(groupBy.where).toMatchObject({ status: 'published' });
    expect(facets).toEqual([
      { id: 'community-1', slug: 'moscow', name: 'Москва', entriesCount: 3 },
    ]);
  });

  it('пустой каталог не ходит за справочником общин', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.groupBy.mockResolvedValue([]);
    const { service } = build(true, prisma);

    expect(await service.communityFacets()).toEqual([]);
    expect(prisma.community.findMany).not.toHaveBeenCalled();
  });

  it('фильтрует ленту по общине', async () => {
    const { service, prisma } = build();

    await service.feed({ communityId: 'community-1' });

    const args = prisma.libraryEntry.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toMatchObject({
      status: 'published',
      communityId: 'community-1',
    });
  });

  it('отдаёт наружу общину, но автором оставляет человека', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findMany = jest.fn().mockResolvedValue([
      entryRecord({
        community: { id: 'community-1', slug: 'moscow', name: 'Москва' },
      }),
    ]);
    const { service } = build(true, prisma);

    const feed = await service.feed({});

    expect(feed.items[0].community).toEqual({
      id: 'community-1',
      slug: 'moscow',
      name: 'Москва',
    });
    // Разбирать жалобу всё равно придётся с человеком, а не с общиной.
    expect(feed.items[0].addedBy?.id).toBe('user-1');
  });
});

describe('LibraryEntriesService — духовная линия', () => {
  function build(prisma = prismaMock()) {
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
      categoriesMock() as never,
      communitiesMock() as never,
      eventsMock() as never,
    );
    return { service, prisma };
  }

  const whereOf = (prisma: ReturnType<typeof prismaMock>) =>
    (prisma.libraryEntry.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    }).where;

  it('без зрителя лента не фильтруется по линии', async () => {
    const { service, prisma } = build();

    await service.feed({});

    expect(whereOf(prisma)).not.toHaveProperty('AND');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('преданному показывает свою линию и материалы «для всех»', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'devotee',
      lineage: 'ipbys',
    });
    const { service } = build(prisma);

    await service.feed({}, 'user-1');

    expect(whereOf(prisma).AND).toEqual([
      { OR: [{ lineage: 'ipbys' }, { lineage: null }] },
    ]);
  });

  it('йогу линию не навязывает, даже если она записана в профиле', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'yogi',
      lineage: 'ipbys',
    });
    const { service } = build(prisma);

    await service.feed({}, 'user-1');

    expect(whereOf(prisma)).not.toHaveProperty('AND');
  });

  it('настройка Образования сильнее профиля', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'devotee',
      lineage: 'iskcon',
    });
    prisma.libraryPreference.findUnique.mockResolvedValue({
      lineage: 'sri_chaitanya_saraswat_math',
    });
    const { service } = build(prisma);

    await service.feed({}, 'user-1');

    expect(whereOf(prisma).AND).toEqual([
      {
        OR: [{ lineage: 'sri_chaitanya_saraswat_math' }, { lineage: null }],
      },
    ]);
  });

  it('явный lineage=all в запросе снимает фильтр и не ходит в профиль', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'devotee',
      lineage: 'iskcon',
    });
    const { service } = build(prisma);

    await service.feed({ lineage: 'all' }, 'user-1');

    expect(whereOf(prisma)).not.toHaveProperty('AND');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('незнакомую линию в запросе игнорирует, а не отдаёт пустую ленту', async () => {
    const { service, prisma } = build();

    await service.feed({ lineage: 'DROP TABLE' });

    expect(whereOf(prisma)).not.toHaveProperty('AND');
  });

  it('фильтр по линии не перетирает условие курсора', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'devotee',
      lineage: 'ipbys',
    });
    const { service } = build(prisma);

    const cursor = Buffer.from(
      JSON.stringify({ p: NOW.toISOString(), i: 'entry-0' }),
      'utf8',
    ).toString('base64url');
    await service.feed({ cursor }, 'user-1');

    const where = whereOf(prisma);
    expect(where.OR).toBeDefined();
    expect(where.AND).toEqual([{ OR: [{ lineage: 'ipbys' }, { lineage: null }] }]);
  });

  it('новый материал без линии получает линию автора-преданного', async () => {
    const prisma = prismaMock();
    prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'devotee',
      lineage: 'nityananda_vamsha',
    });
    const { service } = build(prisma);

    await service.create('user-1', validBody() as never);

    const create = prisma.libraryEntry.create.mock.calls[0][0] as {
      data: { lineage: string | null };
    };
    expect(create.data.lineage).toBe('nityananda_vamsha');
  });

  it('у автора без линии материал подписывается ISKCON', async () => {
    const { service, prisma } = build();

    await service.create('user-1', validBody() as never);

    const create = prisma.libraryEntry.create.mock.calls[0][0] as {
      data: { lineage: string | null };
    };
    expect(create.data.lineage).toBe('iskcon');
  });

  it('явный null — «для всех линий» — сохраняется как есть', async () => {
    const { service, prisma } = build();

    await service.create('user-1', validBody({ lineage: null }) as never);

    const create = prisma.libraryEntry.create.mock.calls[0][0] as {
      data: { lineage: string | null };
    };
    expect(create.data.lineage).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('линию вне справочника отвергает', async () => {
    const { service, prisma } = build();

    await expect(
      service.create('user-1', validBody({ lineage: 'hare' }) as never),
    ).rejects.toMatchObject({ response: { message: 'unsupported_lineage' } });
    expect(prisma.libraryEntry.create).not.toHaveBeenCalled();
  });

  it('отдаёт линию материала наружу', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findMany = jest
      .fn()
      .mockResolvedValue([entryRecord({ lineage: 'ipbys' })]);
    const { service } = build(prisma);

    const feed = await service.feed({});

    expect(feed.items[0].lineage).toBe('ipbys');
  });
});
