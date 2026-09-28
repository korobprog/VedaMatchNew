import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import type { WellnessImagesService } from './wellness-images.service';
import { WellnessKnowledgeService } from './wellness-knowledge.service';

const categories = [
  {
    id: 'ayurveda',
    parentId: null,
    slug: 'ayurveda',
    titleRu: 'Аюрведа',
    titleEn: 'Ayurveda',
    descriptionRu: null,
    position: 0,
  },
  {
    id: 'herbs',
    parentId: 'ayurveda',
    slug: 'herbs',
    titleRu: 'Травы',
    titleEn: null,
    descriptionRu: null,
    position: 0,
  },
  {
    id: 'triphala',
    parentId: 'herbs',
    slug: 'triphala',
    titleRu: 'Трифала',
    titleEn: null,
    descriptionRu: null,
    position: 0,
  },
];

const draft = {
  id: 'a-1',
  categoryId: 'herbs',
  title: 'Трифала',
  body: 'Текст',
  coverUrl: null,
  status: 'draft' as const,
  publishedAt: null,
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  category: { id: 'herbs', slug: 'herbs', titleRu: 'Травы' },
  author: {
    id: 'u-1',
    name: 'Иван',
    spiritualName: 'Говинда дас',
    isAgent: false,
  },
};

function setup() {
  const prisma = {
    wellnessKnowledgeCategory: {
      findMany: jest.fn(() => Promise.resolve(categories)),
      findUnique: jest.fn(({ where }: { where: { id?: string } }) =>
        Promise.resolve(
          categories.find((category) => category.id === where.id) ?? null,
        ),
      ),
      count: jest.fn(() => Promise.resolve(0)),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'new', ...data }),
      ),
      delete: jest.fn(() => Promise.resolve({})),
    },
    wellnessArticle: {
      groupBy: jest.fn(() =>
        Promise.resolve([{ categoryId: 'herbs', _count: { _all: 2 } }]),
      ),
      findUnique: jest.fn(() => Promise.resolve(draft as unknown)),
      count: jest.fn(() => Promise.resolve(0)),
    },
  };
  const images = { remove: jest.fn(() => Promise.resolve()) };
  const service = new WellnessKnowledgeService(
    prisma as unknown as PrismaService,
    images as unknown as WellnessImagesService,
  );
  return { service, prisma };
}

describe('WellnessKnowledgeService', () => {
  it('builds the tree with published counts', async () => {
    const { service } = setup();
    const tree = await service.tree();
    expect(tree[0].children[0]).toMatchObject({ id: 'herbs', articleCount: 2 });
  });

  it('returns breadcrumbs and direct children of a category', async () => {
    const { service } = setup();
    const page = await service.categoryPage('herbs');
    expect(page.breadcrumbs.map((crumb) => crumb.slug)).toEqual([
      'ayurveda',
      'herbs',
    ]);
    expect(page.children.map((child) => child.id)).toEqual(['triphala']);
  });

  it('hides a draft from readers and shows it to admins', async () => {
    const { service } = setup();
    await expect(service.article('a-1', false)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const article = await service.article('a-1', true);
    expect(article.author).toEqual({
      id: 'u-1',
      name: 'Говинда дас',
      isAgent: false,
    });
  });

  it('refuses to nest deeper than two levels', async () => {
    const { service } = setup();
    await expect(
      service.createCategory({ parentId: 'triphala', titleRu: 'Ещё' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('picks a free slug for a new subcategory', async () => {
    const { service, prisma } = setup();
    await service.createCategory({ parentId: 'ayurveda', titleRu: 'Травы' });
    const [[call]] = prisma.wellnessKnowledgeCategory.create.mock.calls as [
      [{ data: { slug: string; position: number } }],
    ];
    expect(call.data).toMatchObject({ slug: 'travy', position: 1 });
  });

  it('never deletes a root category', async () => {
    const { service, prisma } = setup();
    await expect(service.removeCategory('ayurveda')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.wellnessKnowledgeCategory.delete).not.toHaveBeenCalled();
  });

  it('deletes an empty subcategory', async () => {
    const { service, prisma } = setup();
    await service.removeCategory('triphala');
    expect(prisma.wellnessKnowledgeCategory.delete).toHaveBeenCalledWith({
      where: { id: 'triphala' },
    });
  });
});
