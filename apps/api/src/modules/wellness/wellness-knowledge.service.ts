import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  resolveDisplayName,
  type WellnessArticleCard,
  type WellnessArticleDetail,
  type WellnessArticleListResponse,
  type WellnessKnowledgeCategoryDto,
  type WellnessKnowledgeCategoryPage,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ancestorsOf,
  articleExcerpt,
  buildKnowledgeSlug,
  buildKnowledgeTree,
  canNestUnder,
  findKnowledgeNode,
  type KnowledgeRow,
  type ParsedArticleInput,
  type ParsedCategoryInput,
  withSlugSuffix,
} from './knowledge';
import {
  type StoredImage,
  type UploadedImageFile,
  WellnessImagesService,
} from './wellness-images.service';

const CARD_SELECT = {
  id: true,
  categoryId: true,
  title: true,
  body: true,
  coverUrl: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

type CardRow = {
  id: string;
  categoryId: string;
  title: string;
  body: string;
  coverUrl: string | null;
  status: WellnessArticleCard['status'];
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toCard(row: CardRow): WellnessArticleCard {
  return {
    id: row.id,
    categoryId: row.categoryId,
    title: row.title,
    excerpt: articleExcerpt(row.body),
    coverUrl: row.coverUrl,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Раздел «Знания» сервиса «Здоровье» (VED-229): рубрики и статьи. Черновики
 * видят только администраторы сервиса — для остальных их нет вовсе (404).
 */
@Injectable()
export class WellnessKnowledgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly images: WellnessImagesService,
  ) {}

  private async rows(): Promise<KnowledgeRow[]> {
    const [categories, counts] = await Promise.all([
      this.prisma.wellnessKnowledgeCategory.findMany({
        select: {
          id: true,
          parentId: true,
          slug: true,
          titleRu: true,
          titleEn: true,
          descriptionRu: true,
          position: true,
        },
      }),
      this.prisma.wellnessArticle.groupBy({
        by: ['categoryId'],
        where: { status: 'published' },
        _count: { _all: true },
      }),
    ]);
    const countBy = new Map(
      counts.map((count) => [count.categoryId, count._count._all]),
    );
    return categories.map((category) => ({
      ...category,
      articleCount: countBy.get(category.id) ?? 0,
    }));
  }

  async tree(): Promise<WellnessKnowledgeCategoryDto[]> {
    return buildKnowledgeTree(await this.rows());
  }

  async categoryPage(slug: string): Promise<WellnessKnowledgeCategoryPage> {
    const rows = await this.rows();
    const target = rows.find((row) => row.slug === slug);
    if (!target) throw new NotFoundException('Рубрики нет');
    const node = findKnowledgeNode(buildKnowledgeTree(rows), target.id);
    if (!node) throw new NotFoundException('Рубрики нет');
    return {
      category: { ...node, children: [] },
      breadcrumbs: ancestorsOf(rows, target.id).map((row) => ({
        slug: row.slug,
        titleRu: row.titleRu,
      })),
      children: node.children.map((child) => ({ ...child, children: [] })),
    };
  }

  async articles(
    slug: string,
    page: number,
    pageSize: number,
    canSeeDrafts: boolean,
  ): Promise<WellnessArticleListResponse> {
    const category = await this.prisma.wellnessKnowledgeCategory.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Рубрики нет');
    const where = {
      categoryId: category.id,
      ...(canSeeDrafts ? {} : { status: 'published' as const }),
    };
    const [items, total] = await Promise.all([
      this.prisma.wellnessArticle.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: CARD_SELECT,
      }),
      this.prisma.wellnessArticle.count({ where }),
    ]);
    return { items: items.map(toCard), total, page, pageSize };
  }

  async article(
    id: string,
    canSeeDrafts: boolean,
  ): Promise<WellnessArticleDetail> {
    const row = await this.prisma.wellnessArticle.findUnique({
      where: { id },
      select: {
        ...CARD_SELECT,
        category: { select: { id: true, slug: true, titleRu: true } },
        author: {
          select: { id: true, name: true, spiritualName: true, isAgent: true },
        },
      },
    });
    if (!row || (row.status !== 'published' && !canSeeDrafts)) {
      throw new NotFoundException('Статьи нет');
    }
    return {
      ...toCard(row),
      body: row.body,
      category: row.category,
      author: row.author
        ? {
            id: row.author.id,
            name: resolveDisplayName(row.author),
            isAgent: row.author.isAgent,
          }
        : null,
    };
  }

  async createCategory(
    input: ParsedCategoryInput,
  ): Promise<WellnessKnowledgeCategoryDto> {
    const rows = await this.rows();
    const parentId = input.parentId ?? '';
    if (!rows.some((row) => row.id === parentId)) {
      throw new BadRequestException('Родительской рубрики нет');
    }
    if (!canNestUnder(rows, parentId)) {
      throw new BadRequestException(
        'Глубже двух уровней рубрики не вкладываются',
      );
    }
    const titleRu = input.titleRu ?? '';
    const base = buildKnowledgeSlug({ titleRu, titleEn: input.titleEn });
    const taken = new Set(rows.map((row) => row.slug));
    let attempt = 0;
    while (taken.has(withSlugSuffix(base, attempt))) attempt += 1;
    const position =
      input.position ?? rows.filter((row) => row.parentId === parentId).length;
    try {
      const created = await this.prisma.wellnessKnowledgeCategory.create({
        data: {
          parentId,
          slug: withSlugSuffix(base, attempt),
          titleRu,
          titleEn: input.titleEn ?? null,
          descriptionRu: input.descriptionRu ?? null,
          position,
        },
      });
      return { ...created, articleCount: 0, children: [] };
    } catch (error) {
      if ((error as { code?: unknown }).code === 'P2002') {
        throw new ConflictException('Такой адрес рубрики уже занят');
      }
      throw error;
    }
  }

  async updateCategory(
    id: string,
    input: ParsedCategoryInput,
  ): Promise<WellnessKnowledgeCategoryDto> {
    await this.categoryOrThrow(id);
    const updated = await this.prisma.wellnessKnowledgeCategory.update({
      where: { id },
      data: {
        titleRu: input.titleRu,
        titleEn: input.titleEn,
        descriptionRu: input.descriptionRu,
        position: input.position,
      },
    });
    const articleCount = await this.prisma.wellnessArticle.count({
      where: { categoryId: id, status: 'published' },
    });
    return { ...updated, articleCount, children: [] };
  }

  /** Удаляется только пустая подрубрика: корни и наполненные остаются. */
  async removeCategory(id: string): Promise<void> {
    const category = await this.categoryOrThrow(id);
    if (!category.parentId) {
      throw new BadRequestException('Корневую рубрику удалить нельзя');
    }
    const [children, articles] = await Promise.all([
      this.prisma.wellnessKnowledgeCategory.count({ where: { parentId: id } }),
      this.prisma.wellnessArticle.count({ where: { categoryId: id } }),
    ]);
    if (children || articles) {
      throw new BadRequestException(
        'В рубрике есть подрубрики или статьи — сначала уберите их',
      );
    }
    await this.prisma.wellnessKnowledgeCategory.delete({ where: { id } });
  }

  async createArticle(
    authorId: string,
    input: ParsedArticleInput,
  ): Promise<WellnessArticleDetail> {
    await this.categoryOrThrow(input.categoryId ?? '');
    const created = await this.prisma.wellnessArticle.create({
      data: {
        categoryId: input.categoryId ?? '',
        title: input.title ?? '',
        body: input.body ?? '',
        status: input.status ?? 'draft',
        publishedAt: input.status === 'published' ? new Date() : null,
        authorId,
      },
      select: { id: true },
    });
    return this.article(created.id, true);
  }

  async updateArticle(
    id: string,
    input: ParsedArticleInput,
  ): Promise<WellnessArticleDetail> {
    const current = await this.articleOrThrow(id);
    if (input.categoryId) await this.categoryOrThrow(input.categoryId);
    const publishing =
      input.status === 'published' && current.status !== 'published';
    await this.prisma.wellnessArticle.update({
      where: { id },
      data: {
        categoryId: input.categoryId,
        title: input.title,
        body: input.body,
        status: input.status,
        ...(publishing && !current.publishedAt
          ? { publishedAt: new Date() }
          : {}),
      },
    });
    return this.article(id, true);
  }

  async removeArticle(id: string): Promise<void> {
    const current = await this.articleOrThrow(id);
    await this.prisma.wellnessArticle.delete({ where: { id } });
    await this.images.remove(current.coverKey);
  }

  async setCover(
    id: string,
    file: UploadedImageFile | undefined,
  ): Promise<WellnessArticleDetail> {
    const current = await this.articleOrThrow(id);
    const problem = this.images.validate(file);
    if (problem === 'file_too_large') {
      throw new BadRequestException('Картинка больше 10 МБ');
    }
    if (problem || !file) {
      throw new BadRequestException('Обложка — JPEG, PNG или WebP');
    }
    if (!this.images.configured) {
      throw new BadRequestException('Загрузка картинок сейчас недоступна');
    }
    let stored: StoredImage | null;
    try {
      stored = await this.images.storeArticleCover(id, file);
    } catch {
      throw new BadRequestException('Не удалось прочитать картинку');
    }
    if (!stored) {
      throw new BadRequestException('Загрузка картинок сейчас недоступна');
    }
    await this.prisma.wellnessArticle.update({
      where: { id },
      data: { coverKey: stored.key, coverUrl: stored.url },
    });
    await this.images.remove(current.coverKey);
    return this.article(id, true);
  }

  async removeCover(id: string): Promise<WellnessArticleDetail> {
    const current = await this.articleOrThrow(id);
    await this.prisma.wellnessArticle.update({
      where: { id },
      data: { coverKey: null, coverUrl: null },
    });
    await this.images.remove(current.coverKey);
    return this.article(id, true);
  }

  private async categoryOrThrow(id: string) {
    const category = await this.prisma.wellnessKnowledgeCategory.findUnique({
      where: { id },
      select: { id: true, parentId: true },
    });
    if (!category) throw new NotFoundException('Рубрики нет');
    return category;
  }

  private async articleOrThrow(id: string) {
    const article = await this.prisma.wellnessArticle.findUnique({
      where: { id },
      select: { id: true, status: true, publishedAt: true, coverKey: true },
    });
    if (!article) throw new NotFoundException('Статьи нет');
    return article;
  }
}
