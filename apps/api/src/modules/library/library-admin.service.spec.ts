import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LibraryAdminService } from './library-admin.service';
import type { PrismaService } from '../../prisma/prisma.service';

const active = (id: string) => ({
  id,
  status: 'active',
  titleRu: id,
  slug: id,
});

function createService(categories: Record<string, unknown>) {
  const tx = {
    libraryEntryCategory: {
      findMany: jest.fn(() =>
        Promise.resolve([
          { entryId: 'e-1', addedById: 'u-1' },
          { entryId: 'e-2', addedById: null },
        ]),
      ),
      createMany: jest.fn(() => Promise.resolve({ count: 2 })),
      deleteMany: jest.fn(() => Promise.resolve({ count: 2 })),
      count: jest.fn(() => Promise.resolve(5)),
    },
    libraryCategory: { update: jest.fn(() => Promise.resolve({})) },
  };
  const prisma = {
    libraryCategory: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(categories[where.id] ?? null),
      ),
      findMany: jest.fn(() =>
        Promise.resolve([
          { id: 'root-1', slug: 'main', titleRu: 'Основной', titleEn: 'Main' },
        ]),
      ),
      findUniqueOrThrow: jest.fn(() =>
        Promise.resolve({
          id: 'c-1',
          parentId: 'root-1',
          path: '.root-1.',
          slug: 'c-1',
          titleRu: 'Книги',
          titleEn: null,
          status: 'merged',
          entriesCount: 0,
          followersCount: 0,
          normalizedRu: 'книги',
          mergedIntoId: 'c-2',
          createdAt: new Date('2026-08-01T00:00:00.000Z'),
          createdBy: null,
        }),
      ),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<void>) => fn(tx)),
  };
  const events = { emit: jest.fn() };
  const service = new LibraryAdminService(
    prisma as unknown as PrismaService,
    events as never,
  );
  return { service, prisma, tx, events };
}

describe('LibraryAdminService.mergeCategory', () => {
  it('переносит записи и гасит исходную категорию', async () => {
    const { service, tx } = createService({
      'c-1': active('c-1'),
      'c-2': active('c-2'),
    });

    await service.mergeCategory('admin-1', 'c-1', { targetId: 'c-2' });

    expect(tx.libraryEntryCategory.createMany).toHaveBeenCalledWith({
      data: [
        { entryId: 'e-1', categoryId: 'c-2', addedById: 'u-1' },
        { entryId: 'e-2', categoryId: 'c-2', addedById: null },
      ],
      // Запись могла лежать в обеих категориях сразу.
      skipDuplicates: true,
    });
    expect(tx.libraryEntryCategory.deleteMany).toHaveBeenCalledWith({
      where: { categoryId: 'c-1' },
    });
    expect(tx.libraryCategory.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { status: 'merged', mergedIntoId: 'c-2', entriesCount: 0 },
    });
  });

  it('счётчик цели берётся пересчётом, а не сложением', async () => {
    const { service, tx } = createService({
      'c-1': active('c-1'),
      'c-2': active('c-2'),
    });

    await service.mergeCategory('admin-1', 'c-1', { targetId: 'c-2' });

    expect(tx.libraryEntryCategory.count).toHaveBeenCalledWith({
      where: { categoryId: 'c-2' },
    });
    expect(tx.libraryCategory.update).toHaveBeenCalledWith({
      where: { id: 'c-2' },
      data: { entriesCount: 5 },
    });
  });

  it('оставляет след в журнале', async () => {
    const { service, events } = createService({
      'c-1': active('c-1'),
      'c-2': active('c-2'),
    });

    await service.mergeCategory('admin-1', 'c-1', { targetId: 'c-2' });

    expect(events.emit).toHaveBeenCalledWith('admin.action', {
      actorId: 'admin-1',
      action: 'library.category-merged',
      targetType: 'platform',
      targetId: 'c-1',
      details: { from: 'c-1', to: 'c-2' },
    });
  });

  it('не сливает категорию саму в себя', async () => {
    const { service, prisma } = createService({ 'c-1': active('c-1') });

    await expect(
      service.mergeCategory('admin-1', 'c-1', { targetId: 'c-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('требует цель', async () => {
    const { service } = createService({ 'c-1': active('c-1') });

    await expect(
      service.mergeCategory('admin-1', 'c-1', { targetId: '' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('несуществующую цель не принимает', async () => {
    const { service } = createService({ 'c-1': active('c-1'), 'c-2': null });

    await expect(
      service.mergeCategory('admin-1', 'c-1', { targetId: 'c-2' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('уже слитую категорию второй раз не сливает', async () => {
    const { service, prisma } = createService({
      'c-1': { ...active('c-1'), status: 'merged' },
      'c-2': active('c-2'),
    });

    await expect(
      service.mergeCategory('admin-1', 'c-1', { targetId: 'c-2' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
