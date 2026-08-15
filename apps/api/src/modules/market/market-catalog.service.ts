import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateMarketCategoryRequest,
  CreateMarketSectionRequest,
  MarketCategoryDto,
  MarketSectionDto,
  UpdateMarketCategoryRequest,
  UpdateMarketSectionRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PROHIBITED_CATEGORY_SLUGS } from './market-listing-validate';

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Глобальный каталог Рынка. В отличие от библиотеки, категории заводит только
 * администрация: на них висят фильтры выдачи, и пользовательский дрейф
 * таксономии их ломает. Поэтому здесь нет ни подсказки похожих, ни слияния
 * дубликатов — нечему дублироваться.
 */
@Injectable()
export class MarketCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listSections(viewerIsAdmin = false): Promise<MarketSectionDto[]> {
    const sections = await this.prisma.marketSection.findMany({
      orderBy: { position: 'asc' },
      include: { _count: { select: { categories: true } } },
    });

    // Считаем объявления одним groupBy, а не запросом на раздел: разделов
    // десяток, но N+1 здесь ничем не оправдан.
    const perCategory = await this.prisma.marketListingCategory.groupBy({
      by: ['categoryId'],
      where: { listing: { status: 'published', shop: { status: 'active' } } },
      _count: { listingId: true },
    });
    const categories = await this.prisma.marketCategory.findMany({
      select: { id: true, sectionId: true },
    });
    const sectionByCategory = new Map(
      categories.map((category) => [category.id, category.sectionId]),
    );
    const listingsBySection = new Map<string, number>();
    for (const row of perCategory) {
      const sectionId = sectionByCategory.get(row.categoryId);
      if (!sectionId) continue;
      listingsBySection.set(
        sectionId,
        (listingsBySection.get(sectionId) ?? 0) + row._count.listingId,
      );
    }

    return sections.map((section) => ({
      id: section.id,
      slug: section.slug,
      titleRu: section.titleRu,
      titleEn: section.titleEn,
      descriptionRu: section.descriptionRu,
      descriptionEn: section.descriptionEn,
      iconKey: section.iconKey,
      position: section.position,
      categoriesCount: section._count.categories,
      listingsCount: listingsBySection.get(section.id) ?? 0,
      canEdit: viewerIsAdmin,
    }));
  }

  async listCategories(
    sectionSlug: string,
    viewerIsAdmin = false,
  ): Promise<MarketCategoryDto[]> {
    const section = await this.prisma.marketSection.findUnique({
      where: { slug: sectionSlug },
    });
    if (!section) throw new NotFoundException('section_not_found');

    const categories = await this.prisma.marketCategory.findMany({
      where: { sectionId: section.id },
      orderBy: { position: 'asc' },
    });

    return categories.map((category) => ({
      id: category.id,
      sectionId: section.id,
      sectionSlug: section.slug,
      slug: category.slug,
      titleRu: category.titleRu,
      titleEn: category.titleEn,
      descriptionRu: category.descriptionRu,
      descriptionEn: category.descriptionEn,
      position: category.position,
      listingsCount: category.listingsCount,
      prohibited: PROHIBITED_CATEGORY_SLUGS.has(category.slug),
      canEdit: viewerIsAdmin,
    }));
  }

  async createSection(
    viewerIsAdmin: boolean,
    body: CreateMarketSectionRequest,
  ): Promise<MarketSectionDto> {
    if (!viewerIsAdmin) throw new ForbiddenException('not_admin');

    const slug = body.slug?.trim().toLowerCase() ?? '';
    if (!SLUG_PATTERN.test(slug)) throw new BadRequestException('slug_invalid');

    const titleRu = body.titleRu?.trim() ?? '';
    const titleEn = body.titleEn?.trim() ?? '';
    assertTitles(titleRu, titleEn);
    const descriptionRu = trimOrNull(body.descriptionRu);
    const descriptionEn = trimOrNull(body.descriptionEn);
    assertDescriptions(descriptionRu, descriptionEn);

    const taken = await this.prisma.marketSection.findUnique({ where: { slug } });
    if (taken) throw new ConflictException('slug_taken');

    const created = await this.prisma.marketSection.create({
      data: {
        slug,
        titleRu,
        titleEn,
        descriptionRu,
        descriptionEn,
        iconKey: body.iconKey ?? null,
        position: body.position ?? 0,
      },
    });

    return this.findSectionDto(created.id);
  }

  async updateSection(
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateMarketSectionRequest,
  ): Promise<MarketSectionDto> {
    if (!viewerIsAdmin) throw new ForbiddenException('not_admin');

    const existing = await this.prisma.marketSection.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('section_not_found');

    const titleRu =
      body.titleRu !== undefined ? body.titleRu.trim() : existing.titleRu;
    const titleEn =
      body.titleEn !== undefined ? body.titleEn.trim() : existing.titleEn;
    assertTitles(titleRu, titleEn);

    const descriptionRu =
      body.descriptionRu !== undefined
        ? trimOrNull(body.descriptionRu)
        : existing.descriptionRu;
    const descriptionEn =
      body.descriptionEn !== undefined
        ? trimOrNull(body.descriptionEn)
        : existing.descriptionEn;
    assertDescriptions(descriptionRu, descriptionEn);

    await this.prisma.marketSection.update({
      where: { id },
      data: {
        titleRu,
        titleEn,
        descriptionRu,
        descriptionEn,
        iconKey: body.iconKey !== undefined ? body.iconKey : existing.iconKey,
        position: body.position ?? existing.position,
      },
    });

    return this.findSectionDto(id);
  }

  async createCategory(
    viewerIsAdmin: boolean,
    body: CreateMarketCategoryRequest,
  ): Promise<MarketCategoryDto> {
    if (!viewerIsAdmin) throw new ForbiddenException('not_admin');

    const slug = body.slug?.trim().toLowerCase() ?? '';
    if (!SLUG_PATTERN.test(slug)) throw new BadRequestException('slug_invalid');

    const titleRu = body.titleRu?.trim() ?? '';
    const titleEn = body.titleEn?.trim() ?? '';
    assertTitles(titleRu, titleEn);
    const descriptionRu = trimOrNull(body.descriptionRu);
    const descriptionEn = trimOrNull(body.descriptionEn);
    assertDescriptions(descriptionRu, descriptionEn);

    const section = await this.prisma.marketSection.findUnique({
      where: { id: body.sectionId },
    });
    if (!section) throw new NotFoundException('section_not_found');

    const taken = await this.prisma.marketCategory.findUnique({
      where: { sectionId_slug: { sectionId: section.id, slug } },
    });
    if (taken) throw new ConflictException('slug_taken');

    const created = await this.prisma.marketCategory.create({
      data: {
        sectionId: section.id,
        slug,
        titleRu,
        titleEn,
        descriptionRu,
        descriptionEn,
        position: body.position ?? 0,
      },
    });

    return this.findCategoryDto(created.id);
  }

  async updateCategory(
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateMarketCategoryRequest,
  ): Promise<MarketCategoryDto> {
    if (!viewerIsAdmin) throw new ForbiddenException('not_admin');

    const existing = await this.prisma.marketCategory.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('category_not_found');

    const titleRu =
      body.titleRu !== undefined ? body.titleRu.trim() : existing.titleRu;
    const titleEn =
      body.titleEn !== undefined ? body.titleEn.trim() : existing.titleEn;
    assertTitles(titleRu, titleEn);

    const descriptionRu =
      body.descriptionRu !== undefined
        ? trimOrNull(body.descriptionRu)
        : existing.descriptionRu;
    const descriptionEn =
      body.descriptionEn !== undefined
        ? trimOrNull(body.descriptionEn)
        : existing.descriptionEn;
    assertDescriptions(descriptionRu, descriptionEn);

    // Категорию можно перенести в другой раздел; слаг при этом не
    // пересчитывается, чтобы не рвать ссылки на выдачу.
    let sectionId = existing.sectionId;
    if (body.sectionId !== undefined && body.sectionId !== existing.sectionId) {
      const section = await this.prisma.marketSection.findUnique({
        where: { id: body.sectionId },
      });
      if (!section) throw new NotFoundException('section_not_found');
      const taken = await this.prisma.marketCategory.findUnique({
        where: { sectionId_slug: { sectionId: section.id, slug: existing.slug } },
      });
      if (taken) throw new ConflictException('slug_taken');
      sectionId = section.id;
    }

    await this.prisma.marketCategory.update({
      where: { id },
      data: {
        sectionId,
        titleRu,
        titleEn,
        descriptionRu,
        descriptionEn,
        position: body.position ?? existing.position,
      },
    });

    return this.findCategoryDto(id);
  }

  private async findSectionDto(id: string): Promise<MarketSectionDto> {
    const sections = await this.listSections(true);
    const found = sections.find((section) => section.id === id);
    if (!found) throw new NotFoundException('section_not_found');
    return found;
  }

  private async findCategoryDto(id: string): Promise<MarketCategoryDto> {
    const category = await this.prisma.marketCategory.findUnique({
      where: { id },
      include: { section: { select: { slug: true } } },
    });
    if (!category) throw new NotFoundException('category_not_found');
    return {
      id: category.id,
      sectionId: category.sectionId,
      sectionSlug: category.section.slug,
      slug: category.slug,
      titleRu: category.titleRu,
      titleEn: category.titleEn,
      descriptionRu: category.descriptionRu,
      descriptionEn: category.descriptionEn,
      position: category.position,
      listingsCount: category.listingsCount,
      prohibited: PROHIBITED_CATEGORY_SLUGS.has(category.slug),
      canEdit: true,
    };
  }
}

function assertTitles(titleRu: string, titleEn: string): void {
  // Каталог заводит админ, поэтому оба языка обязательны: раздел без
  // английского названия сломает витрину для половины общины.
  if (!titleRu || !titleEn) throw new BadRequestException('title_required');
  if (titleRu.length > MAX_TITLE_LENGTH || titleEn.length > MAX_TITLE_LENGTH) {
    throw new BadRequestException('title_too_long');
  }
}

function assertDescriptions(
  descriptionRu: string | null,
  descriptionEn: string | null,
): void {
  for (const description of [descriptionRu, descriptionEn]) {
    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      throw new BadRequestException('description_too_long');
    }
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
