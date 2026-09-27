import { NotFoundException } from '@nestjs/common';
import { LibraryLikesService } from './library-likes.service';

interface BuildOptions {
  entry?: { status: string } | null;
  created?: number;
  removed?: number;
  count?: number;
}

function build({
  entry = { status: 'published' },
  created = 1,
  removed = 0,
  count = 3,
}: BuildOptions = {}) {
  const tx = {
    libraryEntryLike: {
      createMany: jest.fn().mockResolvedValue({ count: created }),
      deleteMany: jest.fn().mockResolvedValue({ count: removed }),
    },
    libraryEntry: {
      update: jest.fn().mockResolvedValue({ likeCount: count }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ likeCount: count }),
    },
  };
  const prisma = {
    libraryEntry: { findUnique: jest.fn().mockResolvedValue(entry) },
    libraryEntryLike: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((run: (client: typeof tx) => unknown) => run(tx)),
  };
  const service = new LibraryLikesService(prisma as never);
  return { service, prisma, tx };
}

describe('LibraryLikesService (VED-549)', () => {
  it('likes once and bumps the counter', async () => {
    const { service, tx } = build({ created: 1, count: 3 });

    await expect(service.setLike('user-1', 'entry-1', true)).resolves.toEqual({
      liked: true,
      likeCount: 3,
    });
    expect(tx.libraryEntryLike.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', entryId: 'entry-1' }],
      skipDuplicates: true,
    });
    expect(tx.libraryEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
  });

  it('a repeated like leaves the counter alone', async () => {
    const { service, tx } = build({ created: 0, count: 3 });

    await expect(service.setLike('user-1', 'entry-1', true)).resolves.toEqual({
      liked: true,
      likeCount: 3,
    });
    expect(tx.libraryEntry.update).not.toHaveBeenCalled();
    expect(tx.libraryEntry.findUniqueOrThrow).toHaveBeenCalled();
  });

  it('unlike decrements only when there was a like', async () => {
    const { service, tx } = build({ removed: 1, count: 2 });

    await expect(service.setLike('user-1', 'entry-1', false)).resolves.toEqual({
      liked: false,
      likeCount: 2,
    });
    expect(tx.libraryEntryLike.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', entryId: 'entry-1' },
    });
    expect(tx.libraryEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { likeCount: { decrement: 1 } },
      select: { likeCount: true },
    });
  });

  it('a repeated unlike leaves the counter alone', async () => {
    const { service, tx } = build({ removed: 0, count: 2 });

    await expect(service.setLike('user-1', 'entry-1', false)).resolves.toEqual({
      liked: false,
      likeCount: 2,
    });
    expect(tx.libraryEntry.update).not.toHaveBeenCalled();
  });

  it('never reports a negative counter', async () => {
    const { service } = build({ removed: 1, count: -1 });

    await expect(service.setLike('user-1', 'entry-1', false)).resolves.toEqual({
      liked: false,
      likeCount: 0,
    });
  });

  it('answers 404 for a missing entry', async () => {
    const { service, prisma } = build({ entry: null });

    await expect(
      service.setLike('user-1', 'missing', true),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('answers 404 for an unpublished entry', async () => {
    const { service, prisma } = build({ entry: { status: 'hidden' } });

    await expect(
      service.setLike('user-1', 'entry-1', false),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('tells whether the viewer liked the entry', async () => {
    const { service, prisma } = build();
    prisma.libraryEntryLike.findUnique.mockResolvedValueOnce({
      entryId: 'entry-1',
    });

    await expect(service.isLiked('user-1', 'entry-1')).resolves.toBe(true);
    expect(prisma.libraryEntryLike.findUnique).toHaveBeenCalledWith({
      where: { userId_entryId: { userId: 'user-1', entryId: 'entry-1' } },
      select: { entryId: true },
    });
    await expect(service.isLiked('user-1', 'entry-2')).resolves.toBe(false);
  });
});
