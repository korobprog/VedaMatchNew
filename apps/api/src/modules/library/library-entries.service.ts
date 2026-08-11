import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateLibraryEntryRequest,
  LibraryDuplicateEntryConflict,
  LibraryEntryDto,
  LibraryEntryType,
  LibraryFeedResponse,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  decodeCursor,
  encodeCursor,
  feedOrderBy,
  resolveSort,
} from './library-feed-query';
import { resolvePreviewUrl } from './preview-url';
import { normalizeUrl } from './url-normalize';

const PAGE_SIZE = 20;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_CATEGORIES = 5;
const ENTRY_TYPES: LibraryEntryType[] = [
  'website',
  'article',
  'video',
  'audio',
  'book',
  'course',
  'app',
  'telegram_channel',
  'community',
  'other',
];

export interface LibraryFeedFilters {
  sectionSlug?: string;
  categorySlug?: string;
  type?: string;
  language?: string;
  sort?: string;
  q?: string;
  cursor?: string;
}

const ENTRY_SELECT = {
  id: true,
  url: true,
  domain: true,
  type: true,
  contentLanguage: true,
  titleRu: true,
  titleEn: true,
  descriptionRu: true,
  descriptionEn: true,
  faviconUrl: true,
  previewUrl: true,
  status: true,
  usefulCount: true,
  uniqueClickCount: true,
  publishedAt: true,
  addedBy: { select: { id: true, name: true } },
  categories: {
    select: {
      category: {
        select: {
          id: true,
          slug: true,
          titleRu: true,
          titleEn: true,
          section: { select: { slug: true } },
        },
      },
    },
  },
} satisfies Prisma.LibraryEntrySelect;

@Injectable()
export class LibraryEntriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    body: CreateLibraryEntryRequest,
  ): Promise<LibraryEntryDto> {
    if (!body.url || body.url.length > 2000) {
      throw new BadRequestException('url_too_long');
    }
    let normalized: ReturnType<typeof normalizeUrl>;
    try {
      normalized = normalizeUrl(body.url ?? '');
    } catch {
      throw new BadRequestException('unsupported_url');
    }

    if (!ENTRY_TYPES.includes(body.type)) {
      throw new BadRequestException('unsupported_type');
    }

    const titleRu = trimOrNull(body.titleRu);
    const titleEn = trimOrNull(body.titleEn);
    if (!titleRu && !titleEn) throw new BadRequestException('title_required');
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

    const categoryIds = [...new Set(body.categoryIds ?? [])];
    if (categoryIds.length === 0) {
      throw new BadRequestException('category_required');
    }
    if (categoryIds.length > MAX_CATEGORIES) {
      throw new BadRequestException('too_many_categories');
    }

    const existing = await this.prisma.libraryEntry.findUnique({
      where: { urlNormalized: normalized.normalized },
      select: ENTRY_SELECT,
    });
    if (existing) {
      const payload: LibraryDuplicateEntryConflict = {
        code: 'entry_already_exists',
        entry: toEntryDto(existing),
      };
      throw new ConflictException(payload);
    }

    const categories = await this.prisma.libraryCategory.findMany({
      where: { id: { in: categoryIds }, status: 'active' },
      select: { id: true },
    });
    if (categories.length !== categoryIds.length) {
      throw new BadRequestException('category_not_found');
    }

    const language = normalizeLanguage(body.contentLanguage);
    const previewUrl = await resolvePreviewUrl(normalized.url);

    const created = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.libraryEntry.create({
        data: {
          url: normalized.url,
          urlNormalized: normalized.normalized,
          domain: normalized.domain,
          type: body.type,
          contentLanguage: language,
          titleRu,
          titleEn,
          descriptionRu,
          descriptionEn,
          previewUrl,
          addedById: userId,
          enrichmentStatus: 'pending',
        },
        select: ENTRY_SELECT,
      });
      await tx.libraryEntryCategory.createMany({
        data: categoryIds.map((categoryId) => ({
          entryId: entry.id,
          categoryId,
          addedById: userId,
        })),
      });
      await tx.libraryCategory.updateMany({
        where: { id: { in: categoryIds } },
        data: { entriesCount: { increment: 1 } },
      });
      return entry;
    });

    return toEntryDto(created);
  }

  async feed(filters: LibraryFeedFilters): Promise<LibraryFeedResponse> {
    const sort = resolveSort(filters.sort);
    const cursor = decodeCursor(filters.cursor);
    const where: Prisma.LibraryEntryWhereInput = { status: 'published' };

    if (
      filters.type &&
      ENTRY_TYPES.includes(filters.type as LibraryEntryType)
    ) {
      where.type = filters.type as LibraryEntryType;
    }
    if (filters.language) {
      where.contentLanguage = normalizeLanguage(filters.language);
    }
    if (filters.categorySlug) {
      where.categories = { some: { category: { slug: filters.categorySlug } } };
    } else if (filters.sectionSlug) {
      where.categories = {
        some: { category: { section: { slug: filters.sectionSlug } } },
      };
    }
    if (cursor && sort === 'new') {
      where.OR = [
        { publishedAt: { lt: cursor.publishedAt } },
        { publishedAt: cursor.publishedAt, id: { lt: cursor.id } },
      ];
    }

    const searchIds = await this.searchIds(filters.q);
    if (searchIds) {
      if (searchIds.length === 0) {
        return { items: [], nextCursor: null, total: 0 };
      }
      where.id = { in: searchIds };
    }

    const [rows, total] = await Promise.all([
      this.prisma.libraryEntry.findMany({
        where,
        orderBy: feedOrderBy(sort),
        take: PAGE_SIZE + 1,
        select: ENTRY_SELECT,
      }),
      this.prisma.libraryEntry.count({ where }),
    ]);

    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const last = page.at(-1);

    return {
      items: page.map(toEntryDto),
      nextCursor:
        hasMore && last
          ? encodeCursor({ publishedAt: last.publishedAt, id: last.id })
          : null,
      total,
    };
  }

  async byId(id: string): Promise<LibraryEntryDto> {
    const entry = await this.prisma.libraryEntry.findUnique({
      where: { id },
      select: ENTRY_SELECT,
    });
    if (!entry || entry.status !== 'published') {
      throw new NotFoundException('entry_not_found');
    }
    return toEntryDto(entry);
  }

  /** `null` — поиска нет; массив — найденные id в порядке релевантности. */
  private async searchIds(query: string | undefined): Promise<string[] | null> {
    const trimmed = query?.trim();
    if (!trimmed || trimmed.length < 2) return null;
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "LibraryEntry"
      WHERE "status" = 'published'
        AND "searchVector" @@ (
          plainto_tsquery('russian', ${trimmed}) ||
          plainto_tsquery('english', ${trimmed})
        )
      ORDER BY ts_rank(
        "searchVector",
        plainto_tsquery('russian', ${trimmed}) ||
        plainto_tsquery('english', ${trimmed})
      ) DESC
      LIMIT 200
    `);
    return rows.map((row) => row.id);
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeLanguage(value: string | undefined): string {
  const normalized = value?.trim().toLowerCase().slice(0, 8);
  return normalized || 'ru';
}

type EntryRow = Prisma.LibraryEntryGetPayload<{ select: typeof ENTRY_SELECT }>;

function toEntryDto(entry: EntryRow): LibraryEntryDto {
  return {
    id: entry.id,
    url: entry.url,
    domain: entry.domain,
    type: entry.type,
    contentLanguage: entry.contentLanguage,
    titleRu: entry.titleRu,
    titleEn: entry.titleEn,
    descriptionRu: entry.descriptionRu,
    descriptionEn: entry.descriptionEn,
    faviconUrl: entry.faviconUrl,
    previewUrl: entry.previewUrl,
    status: entry.status,
    usefulCount: entry.usefulCount,
    uniqueClickCount: entry.uniqueClickCount,
    publishedAt: entry.publishedAt.toISOString(),
    categories: entry.categories.map((link) => ({
      id: link.category.id,
      slug: link.category.slug,
      sectionSlug: link.category.section.slug,
      titleRu: link.category.titleRu,
      titleEn: link.category.titleEn,
    })),
    addedBy: entry.addedBy
      ? { id: entry.addedBy.id, name: entry.addedBy.name }
      : null,
  };
}
