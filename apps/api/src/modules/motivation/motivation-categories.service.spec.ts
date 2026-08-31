import type { AccessTokenPayload } from '@vedamatch/shared';
import { MotivationCategoriesService } from './motivation-categories.service';

const admin: AccessTokenPayload = {
  sub: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
};
const motivationServiceAdmin: AccessTokenPayload = {
  sub: 'sa-1',
  email: 'sa@example.com',
  role: 'service-admin',
  adminServices: ['motivation'],
};
const otherServiceAdmin: AccessTokenPayload = {
  sub: 'sa-2',
  email: 'sa2@example.com',
  role: 'service-admin',
  adminServices: ['music'],
};
const regularUser: AccessTokenPayload = {
  sub: 'user-1',
  email: 'user@example.com',
  role: 'user',
};

type PrismaStub = {
  motivationCategory: Record<string, jest.Mock>;
  motivationPost: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

function buildPrisma(
  overrides: Partial<PrismaStub['motivationCategory']> = {},
) {
  const motivationCategory = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  };
  const prisma: PrismaStub = {
    motivationCategory,
    motivationPost: {
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
      callback({ motivationCategory }),
    ),
  };
  return prisma;
}

function buildService(prisma: PrismaStub) {
  return new MotivationCategoriesService(prisma as never);
}

describe('MotivationCategoriesService', () => {
  it('rejects non-admin roles', async () => {
    const service = buildService(buildPrisma());
    await expect(service.list(regularUser)).rejects.toThrow();
  });

  it('allows a service-admin scoped to motivation', async () => {
    const service = buildService(buildPrisma());
    await expect(service.list(motivationServiceAdmin)).resolves.toEqual([]);
  });

  it('rejects a service-admin scoped to a different service', async () => {
    const service = buildService(buildPrisma());
    await expect(service.list(otherServiceAdmin)).rejects.toThrow();
  });

  it('derives a slug from the title and makes the first category default', async () => {
    const prisma = buildPrisma();
    prisma.motivationCategory.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        id: 'cat-1',
        ...data,
      }),
    );

    const created = await buildService(prisma).create(admin, {
      title: '  Смирение  ',
    });

    expect(prisma.motivationCategory.create).toHaveBeenCalledWith({
      data: {
        slug: 'smirenie',
        title: 'Смирение',
        parentId: null,
        sortOrder: 10,
        isDefault: true,
      },
    });
    expect(created).toMatchObject({
      slug: 'smirenie',
      isDefault: true,
      postCount: 0,
    });
  });

  it('creates a subcategory under a top-level parent', async () => {
    const prisma = buildPrisma({
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ id: 'cat-1', parentId: null })
        .mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(1),
    });
    prisma.motivationCategory.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        id: 'cat-2',
        ...data,
      }),
    );

    const created = await buildService(prisma).create(admin, {
      title: 'Утренняя практика',
      parentId: 'cat-1',
    });

    expect(prisma.motivationCategory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slug: 'utrennyaya-praktika',
        parentId: 'cat-1',
      }),
    });
    expect(created.parentId).toBe('cat-1');
  });

  it('refuses a third level of nesting', async () => {
    const prisma = buildPrisma({
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'cat-2', parentId: 'cat-1' }),
    });

    await expect(
      buildService(prisma).create(admin, {
        title: 'Глубже',
        parentId: 'cat-2',
      }),
    ).rejects.toThrow('Subcategories cannot be nested any deeper');
  });

  it('refuses to nest a category that still has subcategories', async () => {
    const prisma = buildPrisma({
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ id: 'cat-1', slug: 'vera', isDefault: false })
        .mockResolvedValueOnce({ id: 'cat-3', parentId: null }),
      findFirst: jest.fn().mockResolvedValue({ id: 'child-1' }),
    });

    await expect(
      buildService(prisma).update(admin, 'cat-1', { parentId: 'cat-3' }),
    ).rejects.toThrow(
      'Move the subcategories out before nesting this category',
    );
  });

  it('refuses to make a category its own parent', async () => {
    const prisma = buildPrisma({
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'cat-1', slug: 'vera', isDefault: false }),
    });

    await expect(
      buildService(prisma).update(admin, 'cat-1', { parentId: 'cat-1' }),
    ).rejects.toThrow('A category cannot be its own parent');
  });

  it('lists subcategories right after their parent', async () => {
    const prisma = buildPrisma({
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'a',
          slug: 'a',
          title: 'A',
          sortOrder: 0,
          isDefault: true,
          parentId: null,
        },
        {
          id: 'b-1',
          slug: 'b-1',
          title: 'B-1',
          sortOrder: 5,
          isDefault: false,
          parentId: 'b',
        },
        {
          id: 'b',
          slug: 'b',
          title: 'B',
          sortOrder: 10,
          isDefault: false,
          parentId: null,
        },
        {
          id: 'a-1',
          slug: 'a-1',
          title: 'A-1',
          sortOrder: 20,
          isDefault: false,
          parentId: 'a',
        },
      ]),
    });

    const listed = await buildService(prisma).list(admin);

    expect(listed.map((category) => category.slug)).toEqual([
      'a',
      'a-1',
      'b',
      'b-1',
    ]);
  });

  it('numbers a slug that is already taken', async () => {
    const prisma = buildPrisma({
      findUnique: jest
        .fn()
        .mockResolvedValueOnce({ id: 'existing' })
        .mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(2),
    });
    prisma.motivationCategory.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => ({
        id: 'cat-2',
        ...data,
      }),
    );

    await buildService(prisma).create(admin, { title: 'Вера' });

    expect(prisma.motivationCategory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ slug: 'vera-2', isDefault: false }),
    });
  });

  it('clears the previous default when another category takes over', async () => {
    const prisma = buildPrisma({
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'cat-2', slug: 'vera', isDefault: false }),
      update: jest.fn().mockResolvedValue({
        id: 'cat-2',
        slug: 'vera',
        title: 'Вера',
        sortOrder: 10,
        isDefault: true,
      }),
    });

    await buildService(prisma).update(admin, 'cat-2', { isDefault: true });

    expect(prisma.motivationCategory.updateMany).toHaveBeenCalledWith({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  });

  it('refuses to clear the default flag without a replacement', async () => {
    const prisma = buildPrisma({
      findUnique: jest.fn().mockResolvedValue({ id: 'cat-1', isDefault: true }),
    });

    await expect(
      buildService(prisma).update(admin, 'cat-1', { isDefault: false }),
    ).rejects.toThrow('Pick another default category');
  });

  it('refuses to delete the default category', async () => {
    const prisma = buildPrisma({
      findUnique: jest.fn().mockResolvedValue({ id: 'cat-1', isDefault: true }),
    });

    await expect(buildService(prisma).remove(admin, 'cat-1')).rejects.toThrow(
      'The default category cannot be deleted',
    );
    expect(prisma.motivationCategory.delete).not.toHaveBeenCalled();
  });

  it('deletes a non-default category without touching posts', async () => {
    const prisma = buildPrisma({
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 'cat-2', isDefault: false }),
    });

    await buildService(prisma).remove(admin, 'cat-2');

    expect(prisma.motivationCategory.delete).toHaveBeenCalledWith({
      where: { id: 'cat-2' },
    });
  });

  it('resolves an empty slug to the default category', async () => {
    const prisma = buildPrisma({
      findFirst: jest.fn().mockResolvedValue({ slug: 'smirenie' }),
    });

    await expect(buildService(prisma).resolveSlug(undefined)).resolves.toBe(
      'smirenie',
    );
  });

  it('falls back to the historical slug when the dictionary is empty', async () => {
    await expect(buildService(buildPrisma()).defaultSlug()).resolves.toBe(
      'verified_quote',
    );
  });

  it('rejects an unknown slug instead of creating one', async () => {
    const prisma = buildPrisma();
    await expect(buildService(prisma).resolveSlug('typo')).rejects.toThrow(
      'Unknown category',
    );
  });

  it('reports how many posts sit in each category', async () => {
    const prisma = buildPrisma({
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'cat-1',
          slug: 'smirenie',
          title: 'Смирение',
          sortOrder: 0,
          isDefault: true,
          parentId: null,
        },
        {
          id: 'cat-2',
          slug: 'vera',
          title: 'Вера',
          sortOrder: 10,
          isDefault: false,
          parentId: null,
        },
      ]),
    });
    prisma.motivationPost.groupBy.mockResolvedValue([
      { category: 'smirenie', _count: { _all: 3 } },
    ]);

    await expect(buildService(prisma).list(admin)).resolves.toEqual([
      expect.objectContaining({ slug: 'smirenie', postCount: 3 }),
      expect.objectContaining({ slug: 'vera', postCount: 0 }),
    ]);
  });
});
