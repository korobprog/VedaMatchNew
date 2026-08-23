import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  LibrarySectionDto,
  SaveLibrarySectionRequest,
  UpdateLibrarySectionRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { buildCategorySlug, withSlugSuffix } from './category-slug';

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_SLUG_ATTEMPTS = 20;

@Injectable()
export class LibrarySectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(viewerIsAdmin = false): Promise<LibrarySectionDto[]> {
    const sections = await this.prisma.librarySection.findMany({
      orderBy: { position: 'asc' },
    });
    const entriesCounts = await Promise.all(
      sections.map((section) =>
        this.prisma.libraryEntry.count({
          where: {
            status: 'published',
            categories: { some: { category: { sectionId: section.id } } },
          },
        }),
      ),
    );
    const categoriesCounts = await Promise.all(
      sections.map((section) =>
        this.prisma.libraryCategory.count({
          where: { sectionId: section.id, status: 'active' },
        }),
      ),
    );

    return sections.map((section, index) => ({
      id: section.id,
      slug: section.slug,
      titleRu: section.titleRu,
      titleEn: section.titleEn,
      descriptionRu: section.descriptionRu,
      descriptionEn: section.descriptionEn,
      iconKey: section.iconKey,
      position: section.position,
      categoriesCount: categoriesCounts[index],
      entriesCount: entriesCounts[index],
      canEdit: viewerIsAdmin,
    }));
  }

  /**
   * Разделы — фиксированный, заранее продуманный список рубрик справочника,
   * а не пользовательский контент, поэтому править их может только админ.
   */
  async update(
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateLibrarySectionRequest,
  ): Promise<LibrarySectionDto> {
    if (!viewerIsAdmin) throw new ForbiddenException('not_admin');

    const existing = await this.prisma.librarySection.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('section_not_found');

    const titleRu =
      body.titleRu !== undefined ? body.titleRu.trim() : existing.titleRu;
    const titleEn =
      body.titleEn !== undefined ? body.titleEn.trim() : existing.titleEn;
    if (!titleRu || !titleEn) throw new BadRequestException('title_required');
    if (titleRu.length > MAX_TITLE_LENGTH || titleEn.length > MAX_TITLE_LENGTH) {
      throw new BadRequestException('title_too_long');
    }

    const descriptionRu =
      body.descriptionRu !== undefined
        ? trimOrNull(body.descriptionRu)
        : existing.descriptionRu;
    const descriptionEn =
      body.descriptionEn !== undefined
        ? trimOrNull(body.descriptionEn)
        : existing.descriptionEn;
    for (const description of [descriptionRu, descriptionEn]) {
      if (description && description.length > MAX_DESCRIPTION_LENGTH) {
        throw new BadRequestException('description_too_long');
      }
    }

    await this.prisma.librarySection.update({
      where: { id },
      data: {
        titleRu,
        titleEn,
        descriptionRu,
        descriptionEn,
        iconKey: body.iconKey !== undefined ? body.iconKey : existing.iconKey,
      },
    });

    const sections = await this.list(true);
    return sections.find((section) => section.id === id)!;
  }

  /**
   * Новый раздел — тоже только админ: см. комментарий у update() про
   * фиксированный список рубрик. Встаёт последним по позиции.
   */
  async create(
    viewerIsAdmin: boolean,
    body: SaveLibrarySectionRequest,
  ): Promise<LibrarySectionDto> {
    if (!viewerIsAdmin) throw new ForbiddenException('not_admin');

    const titleRu = body.titleRu?.trim();
    const titleEn = body.titleEn?.trim();
    if (!titleRu || !titleEn) throw new BadRequestException('title_required');
    if (titleRu.length > MAX_TITLE_LENGTH || titleEn.length > MAX_TITLE_LENGTH) {
      throw new BadRequestException('title_too_long');
    }

    const descriptionRu = trimOrNull(body.descriptionRu);
    const descriptionEn = trimOrNull(body.descriptionEn);
    for (const description of [descriptionRu, descriptionEn]) {
      if (description && description.length > MAX_DESCRIPTION_LENGTH) {
        throw new BadRequestException('description_too_long');
      }
    }

    const baseSlug = buildCategorySlug({ titleRu, titleEn });
    const slug = await this.findFreeSlug(baseSlug);
    const lastPosition = await this.prisma.librarySection.aggregate({
      _max: { position: true },
    });

    const created = await this.prisma.librarySection.create({
      data: {
        slug,
        titleRu,
        titleEn,
        descriptionRu,
        descriptionEn,
        iconKey: body.iconKey ?? null,
        position: (lastPosition._max.position ?? -1) + 1,
      },
    });

    const sections = await this.list(true);
    return sections.find((section) => section.id === created.id)!;
  }

  /** В отличие от категории, слаг раздела уникален на всю таблицу. */
  private async findFreeSlug(baseSlug: string): Promise<string> {
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const candidate = withSlugSuffix(baseSlug, attempt);
      const taken = await this.prisma.librarySection.findFirst({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new BadRequestException('slug_conflict');
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
