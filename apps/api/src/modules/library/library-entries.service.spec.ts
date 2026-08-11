import { BadRequestException } from '@nestjs/common';
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
    const service = new LibraryEntriesService(prisma as never);

    await expect(
      service.create(
        'user-1',
        validBody({ url: `https://example.com/${'a'.repeat(2000)}` }),
      ),
    ).rejects.toMatchObject({ response: { message: 'url_too_long' } });
    expect(prisma.libraryEntry.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an unsupported url', async () => {
    const service = new LibraryEntriesService(prismaMock() as never);

    await expect(
      service.create('user-1', validBody({ url: 'ftp://example.com' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires at least one title', async () => {
    const service = new LibraryEntriesService(prismaMock() as never);

    await expect(
      service.create('user-1', validBody({ titleRu: null, titleEn: null })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires at least one category', async () => {
    const service = new LibraryEntriesService(prismaMock() as never);

    await expect(
      service.create('user-1', validBody({ categoryIds: [] })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 409 with the existing entry for a duplicate url', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest
      .fn()
      .mockResolvedValue(entryRecord({ id: 'existing' }));
    const service = new LibraryEntriesService(prisma as never);

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
    const service = new LibraryEntriesService(prisma as never);

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

  it('stores a youtube cover taken from the link itself', async () => {
    const prisma = prismaMock();
    const service = new LibraryEntriesService(prisma as never);

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

  it('rejects category ids that do not exist', async () => {
    const prisma = prismaMock();
    prisma.libraryCategory.findMany = jest.fn().mockResolvedValue([]);
    const service = new LibraryEntriesService(prisma as never);

    await expect(service.create('user-1', validBody())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('LibraryEntriesService.feed', () => {
  it('filters published entries by type and language', async () => {
    const prisma = prismaMock();
    const service = new LibraryEntriesService(prisma as never);

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
    const service = new LibraryEntriesService(prisma as never);

    const result = await service.feed({});

    expect(result.items).toHaveLength(20);
    expect(result.nextCursor).not.toBeNull();
  });

  it('ignores a broken cursor instead of failing', async () => {
    const prisma = prismaMock();
    const service = new LibraryEntriesService(prisma as never);

    const result = await service.feed({ cursor: 'garbage' });

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });
});
