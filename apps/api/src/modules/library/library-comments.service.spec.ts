import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LibraryCommentsService } from './library-comments.service';

const NOW = new Date('2026-08-11T10:00:00.000Z');

function commentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'comment-1',
    entryId: 'entry-1',
    body: 'Полезная лекция',
    status: 'published',
    createdAt: NOW,
    userId: 'user-1',
    user: { id: 'user-1', name: 'Тест' },
    ...overrides,
  };
}

function prismaMock(overrides: Record<string, unknown> = {}) {
  const libraryComment = {
    findMany: jest.fn().mockResolvedValue([commentRow()]),
    findUnique: jest.fn().mockResolvedValue({
      id: 'comment-1',
      userId: 'user-1',
      entryId: 'entry-1',
      status: 'published',
    }),
    create: jest.fn().mockResolvedValue(commentRow()),
    update: jest.fn().mockResolvedValue(commentRow()),
  };
  const libraryEntry = {
    findUnique: jest.fn().mockResolvedValue({ status: 'published' }),
    update: jest.fn().mockResolvedValue({}),
  };
  return {
    libraryComment,
    libraryEntry,
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback({ libraryComment, libraryEntry }),
    ),
    ...overrides,
  };
}

describe('LibraryCommentsService', () => {
  it('rejects an empty comment', async () => {
    const service = new LibraryCommentsService(prismaMock() as never);

    await expect(
      service.create('entry-1', 'user-1', { body: '   ' }),
    ).rejects.toMatchObject({ response: { message: 'comment_required' } });
  });

  it('rejects a comment over the length limit', async () => {
    const service = new LibraryCommentsService(prismaMock() as never);

    await expect(
      service.create('entry-1', 'user-1', { body: 'a'.repeat(2001) }),
    ).rejects.toMatchObject({ response: { message: 'comment_too_long' } });
  });

  it('refuses to comment on a missing entry', async () => {
    const prisma = prismaMock();
    prisma.libraryEntry.findUnique = jest.fn().mockResolvedValue(null);
    const service = new LibraryCommentsService(prisma as never);

    await expect(
      service.create('entry-1', 'user-1', { body: 'Хорошо' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores a trimmed comment and bumps the counter', async () => {
    const prisma = prismaMock();
    const service = new LibraryCommentsService(prisma as never);

    const created = await service.create('entry-1', 'user-1', {
      body: '  Полезная лекция  ',
    });

    const createCalls = prisma.libraryComment.create.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(createCalls[0][0].data.body).toBe('Полезная лекция');
    expect(prisma.libraryEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { commentsCount: { increment: 1 } },
    });
    expect(created.canDelete).toBe(true);
  });

  it('marks only own comments as deletable', async () => {
    const service = new LibraryCommentsService(prismaMock() as never);

    const own = await service.list('entry-1', 'user-1');
    const other = await service.list('entry-1', 'user-2');

    expect(own.items[0].canDelete).toBe(true);
    expect(other.items[0].canDelete).toBe(false);
  });

  it('lets an admin delete a comment written by someone else', async () => {
    const prisma = prismaMock();
    const service = new LibraryCommentsService(prisma as never);

    await service.remove('comment-1', 'admin-1', true);

    const updateCalls = prisma.libraryComment.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(updateCalls[0][0].data.status).toBe('removed_by_admin');
    expect(updateCalls[0][0].data.body).toBe('');
  });

  it('refuses deletion by a stranger', async () => {
    const service = new LibraryCommentsService(prismaMock() as never);

    await expect(service.remove('comment-1', 'user-2')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('does not decrement the counter twice for an already removed comment', async () => {
    const prisma = prismaMock();
    prisma.libraryComment.findUnique = jest.fn().mockResolvedValue({
      id: 'comment-1',
      userId: 'user-1',
      entryId: 'entry-1',
      status: 'removed_by_author',
    });
    const service = new LibraryCommentsService(prisma as never);

    await service.remove('comment-1', 'user-1');

    expect(prisma.libraryEntry.update).not.toHaveBeenCalled();
  });
});
