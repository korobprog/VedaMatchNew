import { LibrarySectionsService } from './library-sections.service';

describe('LibrarySectionsService', () => {
  it('returns sections ordered by position with aggregated counters', async () => {
    const prisma = {
      librarySection: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'section-1',
            slug: 'philosophy',
            titleRu: 'Философия и писания',
            titleEn: 'Philosophy and scriptures',
            descriptionRu: null,
            descriptionEn: null,
            iconKey: 'book',
            position: 1,
            categories: [{ entriesCount: 3 }, { entriesCount: 4 }],
          },
        ]),
      },
      libraryEntry: {
        count: jest.fn().mockResolvedValue(7),
      },
      libraryCategory: {
        count: jest.fn().mockResolvedValue(2),
      },
    };
    const service = new LibrarySectionsService(prisma as never);

    const result = await service.list();

    expect(prisma.librarySection.findMany).toHaveBeenCalledWith({
      orderBy: { position: 'asc' },
    });
    expect(prisma.libraryCategory.count).toHaveBeenCalledWith({
      where: { sectionId: 'section-1', status: 'active' },
    });
    expect(prisma.libraryEntry.count).toHaveBeenCalledWith({
      where: {
        status: 'published',
        categories: {
          some: { category: { sectionId: 'section-1' } },
        },
      },
    });
    expect(result).toEqual([
      {
        id: 'section-1',
        slug: 'philosophy',
        titleRu: 'Философия и писания',
        titleEn: 'Philosophy and scriptures',
        descriptionRu: null,
        descriptionEn: null,
        iconKey: 'book',
        position: 1,
        categoriesCount: 2,
        entriesCount: 7,
        canEdit: false,
      },
    ]);
  });

  it('marks sections as editable for admins', async () => {
    const prisma = {
      librarySection: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'section-1',
            slug: 'philosophy',
            titleRu: 'Философия и писания',
            titleEn: 'Philosophy and scriptures',
            descriptionRu: null,
            descriptionEn: null,
            iconKey: 'book',
            position: 1,
          },
        ]),
      },
      libraryEntry: { count: jest.fn().mockResolvedValue(0) },
      libraryCategory: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new LibrarySectionsService(prisma as never);

    const result = await service.list(true);

    expect(result[0].canEdit).toBe(true);
  });
});

describe('LibrarySectionsService.create', () => {
  function prismaStub() {
    return {
      librarySection: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'section-new',
            slug: 'novyy-razdel',
            titleRu: 'Новый раздел',
            titleEn: 'New section',
            descriptionRu: null,
            descriptionEn: null,
            iconKey: null,
            position: 3,
          },
        ]),
        findFirst: jest.fn().mockResolvedValue(null),
        aggregate: jest.fn().mockResolvedValue({ _max: { position: 2 } }),
        create: jest.fn().mockResolvedValue({ id: 'section-new' }),
      },
      libraryEntry: { count: jest.fn().mockResolvedValue(0) },
      libraryCategory: { count: jest.fn().mockResolvedValue(0) },
    };
  }

  it('отказывает не-админу', async () => {
    const service = new LibrarySectionsService(prismaStub() as never);
    await expect(
      service.create(false, { titleRu: 'Новый раздел', titleEn: 'New section' }),
    ).rejects.toThrow('not_admin');
  });

  it('требует оба названия', async () => {
    const service = new LibrarySectionsService(prismaStub() as never);
    await expect(
      service.create(true, { titleRu: '', titleEn: 'New section' }),
    ).rejects.toThrow('title_required');
  });

  it('создаёт раздел последним по позиции', async () => {
    const prisma = prismaStub();
    const service = new LibrarySectionsService(prisma as never);

    const result = await service.create(true, {
      titleRu: 'Новый раздел',
      titleEn: 'New section',
    });

    expect(prisma.librarySection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slug: 'new-section',
        position: 3,
        titleRu: 'Новый раздел',
        titleEn: 'New section',
      }),
    });
    expect(result.id).toBe('section-new');
  });
});
