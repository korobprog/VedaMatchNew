import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateLibraryCategoryConflict,
  CreateLibraryCategoryRequest,
  LibraryCategoryDto,
  LibraryCategorySuggestion,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildCategorySlug,
  normalizeTitle,
  withSlugSuffix,
} from './category-slug';

/** Выше этого сходства создание требует явного подтверждения пользователем. */
export const SIMILARITY_BLOCK_THRESHOLD = 0.75;
/** Порог для подсказок в форме: шире, чтобы показать варианты. */
const SIMILARITY_SUGGEST_THRESHOLD = 0.3;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_SLUG_ATTEMPTS = 20;

interface SuggestionRow {
  id: string;
  sectionSlug: string;
  slug: string;
  titleRu: string | null;
  titleEn: string | null;
  entriesCount: number;
  similarity: number;
}

@Injectable()
export class LibraryCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listBySection(sectionSlug: string): Promise<LibraryCategoryDto[]> {
    const section = await this.prisma.librarySection.findUnique({
      where: { slug: sectionSlug },
    });
    if (!section) throw new NotFoundException('section_not_found');

    const categories = await this.prisma.libraryCategory.findMany({
      where: { sectionId: section.id, status: 'active' },
      orderBy: [{ entriesCount: 'desc' }, { createdAt: 'asc' }],
    });

    return categories.map((category) => toCategoryDto(category, section.slug));
  }

  async suggest(query: string): Promise<LibraryCategorySuggestion[]> {
    const normalized = normalizeTitle(query);
    if (normalized.length < 3) return [];
    return this.findSimilar(normalized, SIMILARITY_SUGGEST_THRESHOLD);
  }

  async create(
    userId: string,
    body: CreateLibraryCategoryRequest,
  ): Promise<LibraryCategoryDto> {
    const titleRu = trimOrNull(body.titleRu);
    const titleEn = trimOrNull(body.titleEn);
    if (!titleRu && !titleEn) {
      throw new BadRequestException('title_required');
    }
    for (const title of [titleRu, titleEn]) {
      if (title && title.length > MAX_TITLE_LENGTH) {
        throw new BadRequestException('title_too_long');
      }
    }
    const descriptionRu = trimOrNull(body.descriptionRu);
    const descriptionEn = trimOrNull(body.descriptionEn);
    for (const description of [descriptionRu, descriptionEn]) {
      if (description && description.length > MAX_DESCRIPTION_LENGTH) {
        throw new BadRequestException('description_too_long');
      }
    }

    const section = await this.prisma.librarySection.findUnique({
      where: { id: body.sectionId },
    });
    if (!section) throw new NotFoundException('section_not_found');

    const normalizedRu = normalizeTitle(titleRu);
    const normalizedEn = normalizeTitle(titleEn);

    if (!body.force) {
      const suggestionGroups = await Promise.all(
        [normalizedRu, normalizedEn]
          .filter((value): value is string => Boolean(value))
          .map((value) => this.findSimilar(value, SIMILARITY_BLOCK_THRESHOLD)),
      );
      const suggestions = [
        ...new Map(
          suggestionGroups
            .flat()
            .map((suggestion) => [suggestion.id, suggestion]),
        ).values(),
      ].sort((left, right) => right.similarity - left.similarity);
      if (suggestions.length > 0) {
        const payload: CreateLibraryCategoryConflict = {
          code: 'similar_category_exists',
          suggestions,
        };
        throw new UnprocessableEntityException(payload);
      }
    }

    const baseSlug = buildCategorySlug({ titleRu, titleEn });
    const slug = await this.findFreeSlug(section.id, baseSlug);

    const created = await this.prisma.libraryCategory.create({
      data: {
        sectionId: section.id,
        slug,
        titleRu,
        titleEn,
        descriptionRu,
        descriptionEn,
        normalizedRu,
        normalizedEn,
        createdById: userId,
      },
    });

    return toCategoryDto(created, section.slug);
  }

  private async findSimilar(
    normalized: string,
    threshold: number,
  ): Promise<LibraryCategorySuggestion[]> {
    if (!normalized) return [];
    const rows = await this.prisma.$queryRaw<SuggestionRow[]>(Prisma.sql`
      SELECT c."id",
             s."slug" AS "sectionSlug",
             c."slug",
             c."titleRu",
             c."titleEn",
             c."entriesCount",
             GREATEST(
               similarity(c."normalizedRu", ${normalized}),
               similarity(c."normalizedEn", ${normalized})
             ) AS "similarity"
      FROM "LibraryCategory" c
      JOIN "LibrarySection" s ON s."id" = c."sectionId"
      WHERE c."status" = 'active'
        AND GREATEST(
              similarity(c."normalizedRu", ${normalized}),
              similarity(c."normalizedEn", ${normalized})
            ) >= ${threshold}
      ORDER BY "similarity" DESC
      LIMIT 5
    `);

    return rows.map((row) => ({
      id: row.id,
      sectionSlug: row.sectionSlug,
      slug: row.slug,
      titleRu: row.titleRu,
      titleEn: row.titleEn,
      entriesCount: Number(row.entriesCount),
      similarity: Number(row.similarity),
    }));
  }

  private async findFreeSlug(
    sectionId: string,
    baseSlug: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const candidate = withSlugSuffix(baseSlug, attempt);
      const taken = await this.prisma.libraryCategory.findFirst({
        where: { sectionId, slug: candidate },
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

function toCategoryDto(
  category: {
    id: string;
    sectionId: string;
    slug: string;
    titleRu: string | null;
    titleEn: string | null;
    descriptionRu: string | null;
    descriptionEn: string | null;
    entriesCount: number;
    createdAt: Date;
  },
  sectionSlug: string,
): LibraryCategoryDto {
  return {
    id: category.id,
    sectionId: category.sectionId,
    sectionSlug,
    slug: category.slug,
    titleRu: category.titleRu,
    titleEn: category.titleEn,
    descriptionRu: category.descriptionRu,
    descriptionEn: category.descriptionEn,
    entriesCount: category.entriesCount,
    createdAt: category.createdAt.toISOString(),
  };
}
