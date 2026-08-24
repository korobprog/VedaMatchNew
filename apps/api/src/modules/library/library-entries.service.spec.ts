import {
  BadRequestException,
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
    status: 'published',
    usefulCount: 0,
    uniqueClickCount: 0,
    bookmarkCount: 0,
    commentsCount: 0,
    publishedAt: NOW,
    addedBy: { id: 'user-1', name: 'Тест' },
    categories: [],
    ...overrides,
  };
}

function prismaMock(overrides: Record<string, unknown> = {}) {
  const libraryEntry = {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockResolvedValue(entryRecord()),
    update: jest.fn().mockResolvedValue(entryRecord()),
  };
  return {
    libraryEntry,
    libraryCategory: {
      findMany: jest.fn().mockResolvedValue([{ id: 'category-1' }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    libraryEntryCategory: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback({
        libraryEntry,
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

describe('LibraryEntriesService.create', () => {
  it('rejects an overlong url before database access', async () => {
    const prisma = prismaMock();
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
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

  it('rejects an unsupported url', async () => {
    const service = new LibraryEntriesService(
      prismaMock() as never,
      previewsMock() as never,
      bookmarksMock() as never,
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
      eventsMock() as never,
    );

    const result = await service.byId('entry-1', 'admin-1', true);

    expect(result.canEdit).toBe(true);
  });
});

describe('LibraryEntriesService.update', () => {
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

  it('refuses to let another member edit someone else’s entry', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest
      .fn()
      .mockResolvedValue(entryRecord({ addedBy: { id: 'user-1', name: 'X' } }));
    const service = new LibraryEntriesService(
      prisma as never,
      previewsMock() as never,
      bookmarksMock() as never,
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
      eventsMock() as never,
    );

    await expect(
      service.remove('user-1', true, 'entry-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
