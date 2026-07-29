import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LibraryCategoriesService } from './library-categories.service';

const SECTION = { id: 'section-1', slug: 'philosophy' };

function prismaMock(overrides: Record<string, unknown> = {}) {
  return {
    librarySection: {
      findUnique: jest.fn().mockResolvedValue(SECTION),
    },
    libraryCategory: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({
            ...data,
            id: 'category-1',
            entriesCount: 0,
            createdAt: new Date('2026-07-29T10:00:00.000Z'),
            section: SECTION,
          }),
        ),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('LibraryCategoriesService.create', () => {
  it('requires at least one title', async () => {
    const service = new LibraryCategoriesService(prismaMock() as never);

    await expect(
      service.create('user-1', { sectionId: SECTION.id }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks creation when a similar category exists', async () => {
    const prisma = prismaMock({
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: 'category-9',
          sectionSlug: 'philosophy',
          slug: 'gita-lectures',
          titleRu: 'Лекции по Гите',
          titleEn: null,
          entriesCount: 12,
          similarity: 0.91,
        },
      ]),
    });
    const service = new LibraryCategoriesService(prisma as never);

    await expect(
      service.create('user-1', {
        sectionId: SECTION.id,
        titleRu: 'Лекции по гите',
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.libraryCategory.create).not.toHaveBeenCalled();
  });

  it('creates the category when the user confirms with force', async () => {
    const prisma = prismaMock({
      $queryRaw: jest.fn().mockResolvedValue([
        {
          id: 'category-9',
          sectionSlug: 'philosophy',
          slug: 'gita-lectures',
          titleRu: 'Лекции по Гите',
          titleEn: null,
          entriesCount: 12,
          similarity: 0.91,
        },
      ]),
    });
    const service = new LibraryCategoriesService(prisma as never);

    const result = await service.create('user-1', {
      sectionId: SECTION.id,
      titleRu: 'Лекции по гите',
      force: true,
    });

    expect(result.slug).toBe('lekcii-po-gite');
    expect(prisma.libraryCategory.create).toHaveBeenCalledTimes(1);
  });

  it('stores normalized titles and the author', async () => {
    const prisma = prismaMock();
    const service = new LibraryCategoriesService(prisma as never);

    await service.create('user-1', {
      sectionId: SECTION.id,
      titleRu: '  Лекции по Гите!  ',
      titleEn: 'Gita Lectures',
    });

    const { data } = prisma.libraryCategory.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(data.normalizedRu).toBe('лекции по гите');
    expect(data.normalizedEn).toBe('gita lectures');
    expect(data.createdById).toBe('user-1');
    expect(data.slug).toBe('gita-lectures');
  });

  it('appends a numeric suffix when the slug is taken in the section', async () => {
    const prisma = prismaMock();
    prisma.libraryCategory.findFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: 'taken' })
      .mockResolvedValueOnce(null);
    const service = new LibraryCategoriesService(prisma as never);

    const result = await service.create('user-1', {
      sectionId: SECTION.id,
      titleEn: 'Gita Lectures',
    });

    expect(result.slug).toBe('gita-lectures-2');
  });
});
