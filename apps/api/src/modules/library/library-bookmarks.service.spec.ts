import { NotFoundException } from '@nestjs/common';
import { LibraryBookmarksService } from './library-bookmarks.service';

function prismaMock(overrides: Record<string, unknown> = {}) {
  const libraryBookmark = {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const libraryEntry = {
    findUnique: jest.fn().mockResolvedValue({ status: 'published' }),
    update: jest.fn().mockResolvedValue({}),
  };
  return {
    libraryBookmark,
    libraryEntry,
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback({ libraryBookmark, libraryEntry }),
    ),
    ...overrides,
  };
}

describe('LibraryBookmarksService', () => {
  it('adds a bookmark and bumps the counter', async () => {
    const prisma = prismaMock();
    const service = new LibraryBookmarksService(prisma as never);

    await service.add('user-1', 'entry-1');

    expect(prisma.libraryBookmark.create).toHaveBeenCalled();
    expect(prisma.libraryEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { bookmarkCount: { increment: 1 } },
    });
  });

  it('keeps the counter intact when the bookmark already exists', async () => {
    const prisma = prismaMock();
    prisma.libraryBookmark.findUnique = jest
      .fn()
      .mockResolvedValue({ entryId: 'entry-1' });
    const service = new LibraryBookmarksService(prisma as never);

    await service.add('user-1', 'entry-1');

    expect(prisma.libraryBookmark.create).not.toHaveBeenCalled();
    expect(prisma.libraryEntry.update).not.toHaveBeenCalled();
  });

  it('rejects bookmarking a missing entry', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest.fn().mockResolvedValue(null);
    const service = new LibraryBookmarksService(prisma as never);

    await expect(service.add('user-1', 'entry-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not decrement when there was nothing to remove', async () => {
    const prisma = prismaMock();
    prisma.libraryBookmark.deleteMany = jest
      .fn()
      .mockResolvedValue({ count: 0 });
    const service = new LibraryBookmarksService(prisma as never);

    await service.remove('user-1', 'entry-1');

    expect(prisma.libraryEntry.update).not.toHaveBeenCalled();
  });

  it('reports which entries of a page are bookmarked', async () => {
    const prisma = prismaMock();
    prisma.libraryBookmark.findMany = jest
      .fn()
      .mockResolvedValue([{ entryId: 'entry-2' }]);
    const service = new LibraryBookmarksService(prisma as never);

    const marked = await service.markedAmong('user-1', ['entry-1', 'entry-2']);

    expect(marked.has('entry-2')).toBe(true);
    expect(marked.has('entry-1')).toBe(false);
  });

  it('skips the query for an empty page', async () => {
    const prisma = prismaMock();
    const service = new LibraryBookmarksService(prisma as never);

    await service.markedAmong('user-1', []);

    expect(prisma.libraryBookmark.findMany).not.toHaveBeenCalled();
  });
});
