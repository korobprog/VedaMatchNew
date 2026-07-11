import { BadRequestException } from '@nestjs/common';
import type { GitabaseClientMutation } from '@vedamatch/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { GitabaseSyncService } from './gitabase-sync.service';
import { GitabaseUserStateService } from './gitabase-user-state.service';

const createdAt = new Date('2026-07-10T12:00:00.000Z');

function progressMutation(
  overrides: Partial<GitabaseClientMutation> = {},
): GitabaseClientMutation {
  return {
    clientMutationId: 'mutation-progress',
    entity: 'progress',
    entityId: 'book-1',
    baseRevision: 99,
    payload: {
      bookSlug: 'book-1',
      locator: {
        bookSlug: 'book-1',
        chapterSlug: 'chapter-1',
        unitId: 'unit-1',
      },
      percentage: 42,
      lastReadAt: createdAt.toISOString(),
    },
    createdAt: createdAt.toISOString(),
    ...overrides,
  };
}

function bookmarkMutation(
  overrides: Partial<GitabaseClientMutation> = {},
): GitabaseClientMutation {
  return {
    clientMutationId: 'mutation-bookmark',
    entity: 'bookmark',
    entityId: 'bookmark-1',
    baseRevision: 2,
    payload: {
      bookSlug: 'book-1',
      locator: {
        bookSlug: 'book-1',
        chapterSlug: 'chapter-1',
        unitId: 'unit-1',
      },
      label: 'Saved place',
      deletedAt: createdAt.toISOString(),
    },
    createdAt: createdAt.toISOString(),
    ...overrides,
  };
}

function annotationMutation(
  overrides: Partial<GitabaseClientMutation> = {},
): GitabaseClientMutation {
  return {
    clientMutationId: 'mutation-annotation',
    entity: 'annotation',
    entityId: 'annotation-1',
    baseRevision: 1,
    payload: {
      bookSlug: 'book-1',
      kind: 'note',
      locator: {
        bookSlug: 'book-1',
        chapterSlug: 'chapter-1',
        unitId: 'unit-1',
      },
      range: { block: 'translation', start: 0, end: 8 },
      color: 'yellow',
      noteText: 'New note',
      deletedAt: createdAt.toISOString(),
    },
    createdAt: createdAt.toISOString(),
    ...overrides,
  };
}

function createPrismaMock() {
  const prisma = {
    $transaction: jest.fn(),
    gitabaseReadingProgress: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    gitabaseBookmark: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    gitabaseAnnotation: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    gitabaseAnnotationRevision: { create: jest.fn() },
    gitabaseSyncMutation: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
  prisma.$transaction.mockImplementation(
    (callback: (transaction: typeof prisma) => unknown) => callback(prisma),
  );
  return prisma;
}

function createService(prisma: ReturnType<typeof createPrismaMock>) {
  const userState = new GitabaseUserStateService(
    prisma as unknown as PrismaService,
  );
  return new GitabaseSyncService(prisma as unknown as PrismaService, userState);
}

describe('GitabaseSyncService', () => {
  it('applies a mutation batch and reuses duplicated client mutation IDs', async () => {
    const prisma = createPrismaMock();
    const service = createService(prisma);
    prisma.gitabaseSyncMutation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ revision: 7 });
    prisma.gitabaseReadingProgress.findUnique.mockResolvedValue({
      revision: 4,
    });
    prisma.gitabaseReadingProgress.upsert.mockResolvedValue({ revision: 5 });
    prisma.gitabaseSyncMutation.create.mockResolvedValue({
      id: 'server-mutation-1',
      createdAt,
    });
    prisma.gitabaseSyncMutation.findFirst.mockResolvedValue({
      id: 'server-mutation-1',
      createdAt,
    });

    const result = await service.push('user-1', {
      mutations: [
        progressMutation(),
        progressMutation({ clientMutationId: 'mutation-duplicate' }),
      ],
    });

    expect(result.accepted).toEqual([
      { clientMutationId: 'mutation-progress', revision: 5 },
      { clientMutationId: 'mutation-duplicate', revision: 7 },
    ]);
    expect(result.cursor).not.toBe('');
    expect(prisma.gitabaseReadingProgress.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.gitabaseReadingProgress.upsert).toHaveBeenCalledWith({
      where: { userId_bookSlug: { userId: 'user-1', bookSlug: 'book-1' } },
      create: {
        userId: 'user-1',
        bookSlug: 'book-1',
        locator: {
          bookSlug: 'book-1',
          chapterSlug: 'chapter-1',
          unitId: 'unit-1',
        },
        percentage: 42,
        lastReadAt: createdAt,
        revision: 5,
      },
      update: {
        locator: {
          bookSlug: 'book-1',
          chapterSlug: 'chapter-1',
          unitId: 'unit-1',
        },
        percentage: 42,
        lastReadAt: createdAt,
        revision: 5,
      },
      select: { revision: true },
    });
    expect(prisma.gitabaseSyncMutation.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        clientMutationId: 'mutation-progress',
        entity: 'progress',
        entityId: 'book-1',
        revision: 5,
        payload: {
          bookSlug: 'book-1',
          locator: {
            bookSlug: 'book-1',
            chapterSlug: 'chapter-1',
            unitId: 'unit-1',
          },
          percentage: 42,
          lastReadAt: createdAt.toISOString(),
        },
      },
    });
  });

  it('persists bookmark and annotation tombstones and note conflict history', async () => {
    const prisma = createPrismaMock();
    const service = createService(prisma);
    prisma.gitabaseSyncMutation.findUnique.mockResolvedValue(null);
    prisma.gitabaseBookmark.findUnique.mockResolvedValue({
      id: 'bookmark-1',
      userId: 'user-1',
      revision: 2,
    });
    prisma.gitabaseBookmark.update.mockResolvedValue({ revision: 3 });
    prisma.gitabaseAnnotation.findUnique.mockResolvedValue({
      id: 'annotation-1',
      userId: 'user-1',
      revision: 4,
      noteText: 'Previous note',
    });
    prisma.gitabaseAnnotation.update.mockResolvedValue({ revision: 5 });
    prisma.gitabaseSyncMutation.create
      .mockResolvedValueOnce({ id: 'server-mutation-1', createdAt })
      .mockResolvedValueOnce({ id: 'server-mutation-2', createdAt });
    prisma.gitabaseSyncMutation.findFirst.mockResolvedValue({
      id: 'server-mutation-2',
      createdAt,
    });

    const result = await service.push('user-1', {
      mutations: [bookmarkMutation(), annotationMutation()],
    });

    expect(result.accepted).toEqual([
      { clientMutationId: 'mutation-bookmark', revision: 3 },
      { clientMutationId: 'mutation-annotation', revision: 5 },
    ]);
    expect(prisma.gitabaseBookmark.update).toHaveBeenCalledWith({
      where: { id: 'bookmark-1' },
      data: {
        bookSlug: 'book-1',
        locator: {
          bookSlug: 'book-1',
          chapterSlug: 'chapter-1',
          unitId: 'unit-1',
        },
        label: 'Saved place',
        deletedAt: createdAt,
        revision: 3,
      },
      select: { revision: true },
    });
    expect(prisma.gitabaseAnnotation.update).toHaveBeenCalledWith({
      where: { id: 'annotation-1' },
      data: {
        bookSlug: 'book-1',
        kind: 'note',
        locator: {
          bookSlug: 'book-1',
          chapterSlug: 'chapter-1',
          unitId: 'unit-1',
        },
        range: { block: 'translation', start: 0, end: 8 },
        color: 'yellow',
        noteText: 'New note',
        deletedAt: createdAt,
        revision: 5,
      },
      select: { revision: true },
    });
    expect(prisma.gitabaseAnnotationRevision.create).toHaveBeenCalledWith({
      data: {
        annotationId: 'annotation-1',
        revision: 4,
        noteText: 'Previous note',
      },
    });
  });

  it('pulls changes in cursor order and advances from the last result', async () => {
    const prisma = createPrismaMock();
    const service = createService(prisma);
    const firstCreatedAt = new Date('2026-07-10T12:00:00.000Z');
    const secondCreatedAt = new Date('2026-07-10T12:01:00.000Z');
    prisma.gitabaseSyncMutation.findMany
      .mockResolvedValueOnce([
        {
          id: 'server-mutation-1',
          createdAt: firstCreatedAt,
          entity: 'bookmark',
          entityId: 'bookmark-1',
          revision: 2,
          payload: { deletedAt: firstCreatedAt.toISOString() },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'server-mutation-2',
          createdAt: secondCreatedAt,
          entity: 'annotation',
          entityId: 'annotation-1',
          revision: 3,
          payload: { noteText: 'Remote note' },
        },
      ]);

    const first = await service.pull('user-1');
    const second = await service.pull('user-1', first.cursor);

    expect(first.changes).toEqual([
      {
        entity: 'bookmark',
        entityId: 'bookmark-1',
        revision: 2,
        payload: { deletedAt: firstCreatedAt.toISOString() },
      },
    ]);
    expect(second.changes[0]).toEqual(
      expect.objectContaining({ entity: 'annotation', revision: 3 }),
    );
    expect(prisma.gitabaseSyncMutation.findMany).toHaveBeenLastCalledWith({
      where: {
        userId: 'user-1',
        OR: [
          { createdAt: { gt: firstCreatedAt } },
          {
            createdAt: firstCreatedAt,
            id: { gt: 'server-mutation-1' },
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 500,
    });
  });

  it.each([
    ['unknown entity', progressMutation({ entity: 'unknown' as 'progress' })],
    ['blank mutation ID', progressMutation({ clientMutationId: ' ' })],
    ['blank entity ID', progressMutation({ entityId: '' })],
    [
      'invalid locator',
      progressMutation({
        payload: {
          bookSlug: 'book-1',
          locator: { chapterSlug: '', unitId: 'unit-1' },
          percentage: 10,
          lastReadAt: createdAt.toISOString(),
        },
      }),
    ],
    [
      'oversized note',
      annotationMutation({
        payload: {
          ...(annotationMutation().payload as Record<string, unknown>),
          noteText: 'x'.repeat(20_001),
        },
      }),
    ],
  ])('rejects %s', async (_label, mutation) => {
    const service = createService(createPrismaMock());

    await expect(
      service.push('user-1', { mutations: [mutation] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects batches over 100 mutations and malformed cursors', async () => {
    const service = createService(createPrismaMock());
    const mutations = Array.from({ length: 101 }, (_, index) =>
      progressMutation({ clientMutationId: `mutation-${index}` }),
    );

    await expect(service.push('user-1', { mutations })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.pull('user-1', 'not-a-cursor')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
