import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LibraryCategoriesService } from './library-categories.service';

const ROOT = { id: 'root-1', path: '', status: 'active' as const };

/**
 * `findUnique` в сервисе зовут по двум разным ключам: по `id` ищут
 * родителя, по `slug` — занятость адреса. Мок разводит их, иначе проверка
 * свободного слага получала бы родителя и всегда считала слаг занятым.
 */
function prismaMock(overrides: Record<string, unknown> = {}) {
  const libraryCategory = {
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve('slug' in where ? null : ROOT),
    ),
    count: jest.fn().mockResolvedValue(0),
    create: jest
      .fn()
      .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...data,
          id: 'category-1',
          entriesCount: 0,
          iconKey: null,
          createdAt: new Date('2026-07-29T10:00:00.000Z'),
        }),
      ),
    update: jest.fn(),
    delete: jest.fn(),
  };

  return {
    libraryCategory,
    libraryEntryCategory: { count: jest.fn().mockResolvedValue(0) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function similarRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'category-9',
    slug: 'gita-lectures',
    titleRu: 'Лекции по Гите',
    titleEn: null,
    path: '',
    entriesCount: 12,
    similarity: 0.91,
    ...overrides,
  };
}

describe('LibraryCategoriesService.create', () => {
  it('requires at least one title', async () => {
    const service = new LibraryCategoriesService(prismaMock() as never);

    await expect(
      service.create('user-1', false, { parentId: ROOT.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets only an admin create a top-level rubric', async () => {
    const prisma = prismaMock();
    const service = new LibraryCategoriesService(prisma as never);

    await expect(
      service.create('user-1', false, { parentId: null, titleRu: 'Новая' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.libraryCategory.create).not.toHaveBeenCalled();
  });

  it('creates a top-level rubric for an admin', async () => {
    const prisma = prismaMock();
    const service = new LibraryCategoriesService(prisma as never);

    const result = await service.create('admin-1', true, {
      parentId: null,
      titleEn: 'Gita Lectures',
    });

    expect(result.parentId).toBeNull();
    expect(result.depth).toBe(0);
    const { data } = prisma.libraryCategory.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.path).toBe('');
  });

  it('404s for a missing parent', async () => {
    const prisma = prismaMock();
    prisma.libraryCategory.findUnique = jest
      .fn()
      .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve('slug' in where ? null : null),
      );
    const service = new LibraryCategoriesService(prisma as never);

    await expect(
      service.create('user-1', false, { parentId: 'ghost', titleRu: 'Новая' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to create deeper than the tree allows', async () => {
    const prisma = prismaMock();
    prisma.libraryCategory.findUnique = jest
      .fn()
      .mockImplementation(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          'slug' in where
            ? null
            : { id: 'deep', path: '.root-1.mid-1.', status: 'active' },
        ),
      );
    const service = new LibraryCategoriesService(prisma as never);

    await expect(
      service.create('user-1', false, { parentId: 'deep', titleRu: 'Новая' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks creation when a similar rubric exists', async () => {
    const prisma = prismaMock({
      $queryRaw: jest.fn().mockResolvedValue([similarRow()]),
    });
    const service = new LibraryCategoriesService(prisma as never);

    await expect(
      service.create('user-1', false, {
        parentId: ROOT.id,
        titleRu: 'Лекции по гите',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.libraryCategory.create).not.toHaveBeenCalled();
  });

  it('creates the rubric when the user confirms with force', async () => {
    const prisma = prismaMock({
      $queryRaw: jest.fn().mockResolvedValue([similarRow()]),
    });
    const service = new LibraryCategoriesService(prisma as never);

    const result = await service.create('user-1', false, {
      parentId: ROOT.id,
      titleRu: 'Лекции по гите',
      force: true,
    });

    expect(result.slug).toBe('lekcii-po-gite');
    expect(prisma.libraryCategory.create).toHaveBeenCalledTimes(1);
  });

  it('stores the ancestor path, normalized titles and the author', async () => {
    const prisma = prismaMock();
    const service = new LibraryCategoriesService(prisma as never);

    await service.create('user-1', false, {
      parentId: ROOT.id,
      titleRu: '  Лекции по Гите!  ',
      titleEn: 'Gita Lectures',
    });

    const { data } = prisma.libraryCategory.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.path).toBe('.root-1.');
    expect(data.parentId).toBe(ROOT.id);
    expect(data.normalizedRu).toBe('лекции по гите');
    expect(data.normalizedEn).toBe('gita lectures');
    expect(data.createdById).toBe('user-1');
    expect(data.slug).toBe('gita-lectures');
  });

  it('appends a numeric suffix when the slug is taken anywhere in the tree', async () => {
    const prisma = prismaMock();
    let slugLookups = 0;
    prisma.libraryCategory.findUnique = jest
      .fn()
      .mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        if (!('slug' in where)) return Promise.resolve(ROOT);
        slugLookups += 1;
        return Promise.resolve(slugLookups === 1 ? { id: 'taken' } : null);
      });
    const service = new LibraryCategoriesService(prisma as never);

    const result = await service.create('user-1', false, {
      parentId: ROOT.id,
      titleEn: 'Gita Lectures',
    });

    expect(result.slug).toBe('gita-lectures-2');
  });
});

function categoryRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'category-1',
    parentId: 'root-1',
    path: '.root-1.',
    position: 0,
    slug: 'gita-lectures',
    titleRu: 'Лекции по Гите',
    titleEn: 'Gita Lectures',
    descriptionRu: null,
    descriptionEn: null,
    iconKey: null,
    entriesCount: 3,
    createdById: 'author-1',
    createdAt: new Date('2026-07-29T10:00:00.000Z'),
    ...overrides,
  };
}

function updateMock(record = categoryRecord()) {
  return prismaMock({
    libraryCategory: {
      findUnique: jest.fn().mockResolvedValue(record),
      count: jest.fn().mockResolvedValue(0),
      update: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...record, ...data }),
        ),
    },
  });
}

describe('LibraryCategoriesService.update', () => {
  it('lets the author rename their own rubric', async () => {
    const prisma = updateMock();
    const service = new LibraryCategoriesService(prisma as never);

    const result = await service.update('author-1', false, 'category-1', {
      titleRu: 'Лекции по Бхагавад-гите',
    });

    expect(result.titleRu).toBe('Лекции по Бхагавад-гите');
    // Слаг не пересчитывается: на него уже могли сослаться извне.
    expect(result.slug).toBe('gita-lectures');
  });

  it('lets an admin rename a rubric they did not create', async () => {
    const service = new LibraryCategoriesService(updateMock() as never);

    await expect(
      service.update('admin-1', true, 'category-1', { titleRu: 'Новое имя' }),
    ).resolves.toMatchObject({ titleRu: 'Новое имя' });
  });

  it('refuses to let another member edit someone else’s rubric', async () => {
    const prisma = updateMock();
    const service = new LibraryCategoriesService(prisma as never);

    await expect(
      service.update('other-user', false, 'category-1', { titleRu: 'x' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.libraryCategory.update).not.toHaveBeenCalled();
  });

  it('leaves the icon to the administration', async () => {
    const prisma = updateMock();
    const service = new LibraryCategoriesService(prisma as never);

    await expect(
      service.update('author-1', false, 'category-1', { iconKey: 'book-open' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s for a missing rubric', async () => {
    const prisma = updateMock();
    prisma.libraryCategory.findUnique = jest.fn().mockResolvedValue(null);
    const service = new LibraryCategoriesService(prisma as never);

    await expect(
      service.update('author-1', false, 'missing', { titleRu: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

/** Дерево из двух корней; у первого один ребёнок с собственным ребёнком. */
function treeRows() {
  return [
    { ...categoryRecord({ id: 'root-1', parentId: null, path: '', position: 0, slug: 'philosophy' }) },
    { ...categoryRecord({ id: 'root-2', parentId: null, path: '', position: 1, slug: 'music' }) },
    { ...categoryRecord({ id: 'mid-1', parentId: 'root-1', path: '.root-1.', position: 0, slug: 'prabhupada' }) },
    {
      ...categoryRecord({
        id: 'leaf-1',
        parentId: 'mid-1',
        path: '.root-1.mid-1.',
        position: 0,
        slug: 'lectures',
      }),
    },
  ];
}

function moveMock() {
  return prismaMock({
    libraryCategory: {
      findMany: jest.fn().mockResolvedValue(treeRows()),
      findUnique: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  });
}

describe('LibraryCategoriesService.move', () => {
  it('refuses anyone without the right to reorganise', async () => {
    const prisma = moveMock();
    const service = new LibraryCategoriesService(prisma as never);

    await expect(
      service.move('user-1', false, false, 'mid-1', { parentId: 'root-2' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a move into the rubric’s own subtree', async () => {
    const service = new LibraryCategoriesService(moveMock() as never);

    await expect(
      service.move('admin-1', true, true, 'root-1', { parentId: 'leaf-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a move that would push the subtree too deep', async () => {
    const service = new LibraryCategoriesService(moveMock() as never);

    await expect(
      service.move('admin-1', true, true, 'root-1', { parentId: 'root-2' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s for a missing rubric', async () => {
    const service = new LibraryCategoriesService(moveMock() as never);

    await expect(
      service.move('admin-1', true, true, 'ghost', { parentId: null }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('writes the subtree in one transaction', async () => {
    const prisma = moveMock();
    const service = new LibraryCategoriesService(prisma as never);

    await service.move('admin-1', true, true, 'mid-1', { parentId: 'root-2' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Сам узел и его потомок: путь ребёнка обязан переехать вместе с ним.
    const updated = prisma.libraryCategory.update.mock.calls.map(
      ([arg]: [{ where: { id: string }; data: Record<string, unknown> }]) => [
        arg.where.id,
        arg.data.path,
      ],
    );
    expect(updated).toEqual(
      expect.arrayContaining([
        ['mid-1', '.root-2.'],
        ['leaf-1', '.root-2.mid-1.'],
      ]),
    );
  });
});

describe('LibraryCategoriesService.remove', () => {
  it('refuses a non-admin', async () => {
    const service = new LibraryCategoriesService(prismaMock() as never);

    await expect(service.remove(false, 'category-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('refuses a rubric that still has children', async () => {
    const prisma = prismaMock();
    prisma.libraryCategory.findUnique = jest
      .fn()
      .mockResolvedValue({ id: 'category-1', entriesCount: 0 });
    prisma.libraryCategory.count = jest.fn().mockResolvedValue(2);
    const service = new LibraryCategoriesService(prisma as never);

    await expect(service.remove(true, 'category-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.libraryCategory.delete).not.toHaveBeenCalled();
  });

  it('refuses a rubric that still holds material', async () => {
    const prisma = prismaMock();
    prisma.libraryCategory.findUnique = jest
      .fn()
      .mockResolvedValue({ id: 'category-1', entriesCount: 4 });
    prisma.libraryEntryCategory.count = jest.fn().mockResolvedValue(4);
    const service = new LibraryCategoriesService(prisma as never);

    await expect(service.remove(true, 'category-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.libraryCategory.delete).not.toHaveBeenCalled();
  });

  it('deletes an empty rubric', async () => {
    const prisma = prismaMock();
    prisma.libraryCategory.findUnique = jest
      .fn()
      .mockResolvedValue({ id: 'category-1', entriesCount: 0 });
    const service = new LibraryCategoriesService(prisma as never);

    await expect(service.remove(true, 'category-1')).resolves.toEqual({
      ok: true,
    });
    expect(prisma.libraryCategory.delete).toHaveBeenCalledWith({
      where: { id: 'category-1' },
    });
  });
});
