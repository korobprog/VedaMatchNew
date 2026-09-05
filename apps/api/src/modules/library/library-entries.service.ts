import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  CreateLibraryEntryRequest,
  LibraryCommunityFacet,
  LibraryDuplicateEntryConflict,
  LibraryEntryDto,
  LibraryEntryType,
  LibraryFeedResponse,
  PortalActivityEvent,
  UpdateLibraryEntryRequest,
} from '@vedamatch/shared';
import { PORTAL_ACTIVITY_EVENTS, resolveDisplayName } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CommunitiesService } from '../communities/communities.service';
import {
  decodeCursor,
  encodeCursor,
  feedOrderBy,
  resolveSort,
} from './library-feed-query';
import { LibraryBookmarksService } from './library-bookmarks.service';
import { LibraryCategoriesService } from './library-categories.service';
import { LibraryPreviewsService } from './library-previews.service';
import { resolvePreviewUrl } from './preview-url';
import { normalizeUrl } from './url-normalize';

const PAGE_SIZE = 20;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_CATEGORIES = 5;
/** «Бхагавад-гита 9.22, комментарий Прабхупады» и подобное — не реферат. */
const MAX_SOURCE_LENGTH = 300;
const MAX_PREVIEW_UPLOAD_SIZE = 5 * 1024 * 1024;
const PREVIEW_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ENTRY_TYPES: LibraryEntryType[] = [
  'website',
  'article',
  'video',
  'audio',
  'book',
  'course',
  'app',
  'telegram_channel',
  'vk_group',
  'community',
  'other',
];

export interface UploadedPreviewFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface LibraryFeedFilters {
  categorySlug?: string;
  /** `'false'` — только сама рубрика, без вложенных. */
  withDescendants?: string;
  type?: string;
  language?: string;
  sort?: string;
  q?: string;
  cursor?: string;
  /** `'true'` — только избранное текущего пользователя. */
  bookmarked?: string;
  /** Организационная принадлежность: материалы от имени этой общины. */
  communityId?: string;
}

const ENTRY_SELECT = {
  id: true,
  url: true,
  domain: true,
  source: true,
  type: true,
  contentLanguage: true,
  titleRu: true,
  titleEn: true,
  descriptionRu: true,
  descriptionEn: true,
  faviconUrl: true,
  previewUrl: true,
  previewIsCustom: true,
  status: true,
  usefulCount: true,
  uniqueClickCount: true,
  bookmarkCount: true,
  commentsCount: true,
  publishedAt: true,
  addedBy: { select: { id: true, name: true, spiritualName: true } },
  /* Одна из четырёх портальных моделей, читать которые сервису разрешено, —
     см. docs/service-module-contract.md. Только чтение и только эти три поля:
     подпись «от кого» и ссылка на общину. */
  community: { select: { id: true, slug: true, name: true } },
  categories: {
    select: {
      category: {
        select: {
          id: true,
          slug: true,
          titleRu: true,
          titleEn: true,
        },
      },
    },
  },
} satisfies Prisma.LibraryEntrySelect;

@Injectable()
export class LibraryEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly previews: LibraryPreviewsService,
    private readonly bookmarks: LibraryBookmarksService,
    private readonly categories: LibraryCategoriesService,
    private readonly communities: CommunitiesService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Право подписать материал общиной.
   *
   * Спрашивается у справочника, а не проверяется копией правил внутри
   * сервиса: право живёт в членстве, и вторая копия разошлась бы с ним на
   * первой же смене роли.
   */
  private async assertCommunityRight(
    userId: string,
    communityId: string | null,
  ) {
    if (!communityId) return;
    const allowed = await this.communities.canPostAs(userId, communityId);
    if (!allowed) throw new ForbiddenException('community_not_allowed');
  }

  async create(
    userId: string,
    body: CreateLibraryEntryRequest,
  ): Promise<LibraryEntryDto> {
    // Адрес есть не у каждого материала: цитата из книги описывается
    // источником. Пустыми оба быть не могут — того же требует
    // CHECK-ограничение LibraryEntry_url_or_source в базе.
    const rawUrl = trimOrNull(body.url);
    const source = trimOrNull(body.source);
    if (!rawUrl && !source) {
      throw new BadRequestException('url_or_source_required');
    }
    if (source && source.length > MAX_SOURCE_LENGTH) {
      throw new BadRequestException('source_too_long');
    }

    let normalized: ReturnType<typeof normalizeUrl> | null = null;
    if (rawUrl) {
      if (rawUrl.length > 2000) throw new BadRequestException('url_too_long');
      try {
        normalized = normalizeUrl(rawUrl);
      } catch {
        throw new BadRequestException('unsupported_url');
      }
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

    // Дубли ловятся только по адресу. Ключа у материала с одним источником
    // нет и быть не должно: «Бхагавад-гита» законно стоит источником у
    // множества разных материалов.
    if (normalized) {
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
    }

    const categories = await this.prisma.libraryCategory.findMany({
      where: { id: { in: categoryIds }, status: 'active' },
      select: { id: true },
    });
    if (categories.length !== categoryIds.length) {
      throw new BadRequestException('category_not_found');
    }

    const communityId = body.communityId?.trim() || null;
    await this.assertCommunityRight(userId, communityId);

    const language = normalizeLanguage(body.contentLanguage);
    // Обложку тянуть неоткуда, когда нет адреса.
    const previewUrl = normalized ? await resolvePreviewUrl(normalized.url) : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.libraryEntry.create({
        data: {
          url: normalized?.url ?? null,
          urlNormalized: normalized?.normalized ?? null,
          domain: normalized?.domain ?? null,
          source,
          type: body.type,
          contentLanguage: language,
          titleRu,
          titleEn,
          descriptionRu,
          descriptionEn,
          previewUrl,
          addedById: userId,
          communityId,
          // Без адреса обогащать нечего — иначе запись навсегда осталась бы
          // `pending` и числилась проблемной в админке.
          enrichmentStatus: normalized ? 'pending' : 'not_applicable',
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

    // Копию обложки кладём в S3 уже после ответа: пользователю незачем ждать
    // скачивание и сжатие картинки, а ссылка на источник у записи уже есть.
    if (previewUrl && normalized) {
      this.previews.captureInBackground(created.id, normalized.url, previewUrl);
    }

    const event: PortalActivityEvent = {
      name: PORTAL_ACTIVITY_EVENTS.library,
      userId,
      action: 'library.entry-created',
      occurredAt: new Date().toISOString(),
      entityId: created.id,
      entityLabel: titleRu ?? titleEn ?? undefined,
      link: `/library/entry/${created.id}`,
    };
    this.events.emit(event.name, event);

    return toEntryDto(created, false, userId, false);
  }

  /**
   * Автор ссылки и админ могут поправить адрес, заголовок, описание, тип,
   * язык и набор категорий.
   *
   * Адрес правится с теми же проверками, что и при создании: нормализация,
   * длина, поддерживаемая схема и уникальность `urlNormalized` — на нём
   * держится дедупликация. Смена адреса обесценивает всё, что сервер
   * вычитал по старому: og-поля, фавиконку, канонический адрес и результат
   * обогащения сбрасываются, а автообложка перезапрашивается. Обложку,
   * загруженную человеком (`previewIsCustom`), не трогаем — её ставили
   * руками и авто-обновление её не заменяет.
   */
  async update(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateLibraryEntryRequest,
  ): Promise<LibraryEntryDto> {
    const existing = await this.prisma.libraryEntry.findUnique({
      where: { id },
      select: ENTRY_SELECT,
    });
    if (!existing || existing.status !== 'published') {
      throw new NotFoundException('entry_not_found');
    }
    if (existing.addedBy?.id !== userId && !viewerIsAdmin) {
      throw new ForbiddenException('not_entry_owner');
    }

    const data: Prisma.LibraryEntryUpdateInput = {};

    // Новый адрес: `undefined` — не трогать, пустая строка — снять.
    let nextUrl: ReturnType<typeof normalizeUrl> | null = null;
    let urlChanged = false;
    if (body.url !== undefined) {
      const rawUrl = trimOrNull(body.url);
      const current = await this.prisma.libraryEntry.findUniqueOrThrow({
        where: { id },
        select: { urlNormalized: true },
      });

      if (!rawUrl) {
        // Снять адрес можно только у материала с источником: пустыми оба
        // быть не могут — того же требует CHECK-ограничение в базе.
        if (!existing.source) {
          throw new BadRequestException('url_or_source_required');
        }
        urlChanged = current.urlNormalized !== null;
      } else {
        if (rawUrl.length > 2000) throw new BadRequestException('url_too_long');
        try {
          nextUrl = normalizeUrl(rawUrl);
        } catch {
          throw new BadRequestException('unsupported_url');
        }
        urlChanged = nextUrl.normalized !== current.urlNormalized;

        if (urlChanged) {
          const duplicate = await this.prisma.libraryEntry.findUnique({
            where: { urlNormalized: nextUrl.normalized },
            select: ENTRY_SELECT,
          });
          if (duplicate) {
            const payload: LibraryDuplicateEntryConflict = {
              code: 'entry_already_exists',
              entry: toEntryDto(duplicate),
            };
            throw new ConflictException(payload);
          }
        }
      }

      if (urlChanged) {
        data.url = nextUrl?.url ?? null;
        data.urlNormalized = nextUrl?.normalized ?? null;
        data.domain = nextUrl?.domain ?? null;
        // Всё, что сервер вычитал по прежнему адресу, к новому отношения не
        // имеет. Оставить это значило бы показывать чужой заголовок и
        // фавиконку рядом с новой ссылкой.
        data.canonicalUrl = null;
        data.ogTitle = null;
        data.ogDescription = null;
        data.ogSiteName = null;
        data.faviconUrl = null;
        data.enrichmentError = null;
        data.enrichedAt = null;
        data.httpStatus = null;
        data.lastCheckedAt = null;
        data.enrichmentStatus = nextUrl ? 'pending' : 'not_applicable';
        if (!existing.previewIsCustom) {
          data.previewKey = null;
          data.previewUrl = nextUrl
            ? await resolvePreviewUrl(nextUrl.url)
            : null;
        }
      }
    }

    if (body.type !== undefined) {
      if (!ENTRY_TYPES.includes(body.type)) {
        throw new BadRequestException('unsupported_type');
      }
      data.type = body.type;
    }
    if (body.communityId !== undefined) {
      const nextCommunityId = body.communityId?.trim() || null;
      /* Спрашиваем право только когда подпись меняется, и не спрашиваем у
         админа портала.

         В Объявлениях право перепроверяется на любой правке. Здесь так
         нельзя по двум причинам. Первая: админ правит чужие материалы из
         очереди модерации, а членом их общины не состоит — сохранение чужой
         карточки упиралось бы в отказ. Вторая: человек, у которого роль в
         общине сняли, иначе не смог бы даже поправить опечатку, хотя
         починить устаревшую подпись можно только правкой — как раз той,
         которую отказ и запрещает.

         Что при этом защищено: новую подпись без права поставить нельзя, и
         это ровно то, ради чего проверка существует. */
      const changed = nextCommunityId !== (existing.community?.id ?? null);
      if (changed && !viewerIsAdmin) {
        await this.assertCommunityRight(userId, nextCommunityId);
      }
      data.community = nextCommunityId
        ? { connect: { id: nextCommunityId } }
        : { disconnect: true };
    }
    if (body.contentLanguage !== undefined) {
      data.contentLanguage = normalizeLanguage(body.contentLanguage);
    }

    if (body.titleRu !== undefined || body.titleEn !== undefined) {
      const titleRu =
        body.titleRu !== undefined ? trimOrNull(body.titleRu) : existing.titleRu;
      const titleEn =
        body.titleEn !== undefined ? trimOrNull(body.titleEn) : existing.titleEn;
      if (!titleRu && !titleEn) throw new BadRequestException('title_required');
      for (const title of [titleRu, titleEn]) {
        if (title && title.length > MAX_TITLE_LENGTH) {
          throw new BadRequestException('title_too_long');
        }
      }
      data.titleRu = titleRu;
      data.titleEn = titleEn;
    }

    if (body.descriptionRu !== undefined || body.descriptionEn !== undefined) {
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
      data.descriptionRu = descriptionRu;
      data.descriptionEn = descriptionEn;
    }

    let categoryIds: string[] | null = null;
    if (body.categoryIds !== undefined) {
      categoryIds = [...new Set(body.categoryIds)];
      if (categoryIds.length === 0) {
        throw new BadRequestException('category_required');
      }
      if (categoryIds.length > MAX_CATEGORIES) {
        throw new BadRequestException('too_many_categories');
      }
      const categories = await this.prisma.libraryCategory.findMany({
        where: { id: { in: categoryIds }, status: 'active' },
        select: { id: true },
      });
      if (categories.length !== categoryIds.length) {
        throw new BadRequestException('category_not_found');
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.libraryEntry.update({ where: { id }, data });
      }

      if (categoryIds) {
        const currentIds = existing.categories.map((link) => link.category.id);
        const toRemove = currentIds.filter((cid) => !categoryIds!.includes(cid));
        const toAdd = categoryIds.filter((cid) => !currentIds.includes(cid));

        if (toRemove.length > 0) {
          await tx.libraryEntryCategory.deleteMany({
            where: { entryId: id, categoryId: { in: toRemove } },
          });
          await tx.libraryCategory.updateMany({
            where: { id: { in: toRemove } },
            data: { entriesCount: { decrement: 1 } },
          });
        }
        if (toAdd.length > 0) {
          await tx.libraryEntryCategory.createMany({
            data: toAdd.map((categoryId) => ({
              entryId: id,
              categoryId,
              addedById: userId,
            })),
          });
          await tx.libraryCategory.updateMany({
            where: { id: { in: toAdd } },
            data: { entriesCount: { increment: 1 } },
          });
        }
      }

      return tx.libraryEntry.findUniqueOrThrow({
        where: { id },
        select: ENTRY_SELECT,
      });
    });

    // Копию новой обложки кладём в S3 после ответа — ровно как при создании:
    // человеку незачем ждать скачивание и сжатие картинки.
    if (
      urlChanged &&
      nextUrl &&
      !existing.previewIsCustom &&
      updated.previewUrl
    ) {
      this.previews.captureInBackground(id, nextUrl.url, updated.previewUrl);
    }

    return toEntryDto(updated, false, userId, viewerIsAdmin);
  }

  /**
   * Удаляют автор ссылки и админ (админ — любую). Строку убираем совсем, а не
   * прячем статусом: на `urlNormalized` висит уникальный индекс, и скрытая
   * запись навсегда заняла бы адрес — ни автор, ни кто-то другой не смог бы
   * добавить эту ссылку заново. Категории, избранное и комментарии уходят
   * каскадом по схеме, руками правим только денормализованные счётчики.
   */
  async remove(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
  ): Promise<void> {
    const existing = await this.prisma.libraryEntry.findUnique({
      where: { id },
      select: {
        id: true,
        addedById: true,
        status: true,
        previewKey: true,
        categories: { select: { categoryId: true } },
      },
    });
    if (!existing || existing.status !== 'published') {
      throw new NotFoundException('entry_not_found');
    }
    if (existing.addedById !== userId && !viewerIsAdmin) {
      throw new ForbiddenException('not_entry_owner');
    }

    const categoryIds = existing.categories.map((link) => link.categoryId);

    await this.prisma.$transaction(async (tx) => {
      if (categoryIds.length > 0) {
        await tx.libraryCategory.updateMany({
          where: { id: { in: categoryIds } },
          data: { entriesCount: { decrement: 1 } },
        });
      }
      await tx.libraryEntry.delete({ where: { id } });
    });

    await this.previews.remove(existing.previewKey);
  }

  /**
   * Ручная обложка полностью заменяет авто-превью с сайта-источника и
   * помечается `previewIsCustom`, чтобы фоновый бэкафилл её не перезаписал.
   */
  async uploadPreview(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    file: UploadedPreviewFile | undefined,
  ): Promise<LibraryEntryDto> {
    const existing = await this.prisma.libraryEntry.findUnique({
      where: { id },
      select: ENTRY_SELECT,
    });
    if (!existing || existing.status !== 'published') {
      throw new NotFoundException('entry_not_found');
    }
    if (existing.addedBy?.id !== userId && !viewerIsAdmin) {
      throw new ForbiddenException('not_entry_owner');
    }
    if (!this.previews.configured) {
      throw new BadRequestException('preview_upload_unavailable');
    }
    if (!file || file.size === 0) {
      throw new BadRequestException('preview_file_required');
    }
    if (!PREVIEW_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('unsupported_image_type');
    }
    if (file.size > MAX_PREVIEW_UPLOAD_SIZE) {
      throw new BadRequestException('preview_file_too_large');
    }

    const stored = await this.previews.storeBuffer(id, file.buffer);
    if (!stored) throw new BadRequestException('preview_upload_failed');

    const updated = await this.prisma.libraryEntry.update({
      where: { id },
      data: {
        previewKey: stored.key,
        previewUrl: stored.url,
        previewIsCustom: true,
        enrichmentStatus: 'ready',
        enrichedAt: new Date(),
      },
      select: ENTRY_SELECT,
    });

    return toEntryDto(updated, false, userId, viewerIsAdmin);
  }

  /**
   * Общины, от имени которых в каталоге действительно что-то лежит.
   *
   * Не весь справочник: список организаций портала длиннее того, что успело
   * попасть в Образование, и фильтр из сотни пунктов, где полтора рабочих,
   * бесполезен. Здесь ровно те, по которым фильтр что-то найдёт.
   *
   * Прямое чтение `Community` — одна из четырёх портальных моделей, которые
   * сервису разрешено читать (docs/service-module-contract.md). Только
   * чтение и только подпись.
   */
  async communityFacets(): Promise<LibraryCommunityFacet[]> {
    const rows = await this.prisma.community.findMany({
      where: { libraryEntries: { some: { status: 'published' } } },
      select: {
        id: true,
        slug: true,
        name: true,
        _count: { select: { libraryEntries: true } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      entriesCount: row._count.libraryEntries,
    }));
  }

  async feed(
    filters: LibraryFeedFilters,
    viewerId?: string,
    viewerIsAdmin = false,
  ): Promise<LibraryFeedResponse> {
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
    if (filters.communityId) {
      where.communityId = filters.communityId;
    }
    // Рубрика фильтрует лентой всё своё поддерево: иначе вложение прятало бы
    // материалы — человек убирает рубрику внутрь другой и видит пустую
    // ленту родителя. `withDescendants=false` сужает до самой рубрики.
    if (filters.categorySlug) {
      const ids =
        filters.withDescendants === 'false'
          ? null
          : await this.categories.subtreeIds(filters.categorySlug);
      where.categories = ids
        ? { some: { categoryId: { in: ids } } }
        : { some: { category: { slug: filters.categorySlug } } };
    }
    if (cursor && sort === 'new') {
      where.OR = [
        { publishedAt: { lt: cursor.publishedAt } },
        { publishedAt: cursor.publishedAt, id: { lt: cursor.id } },
      ];
    }

    // Избранное и поиск оба ограничивают набор id, поэтому пересекаем их,
    // а не перетираем: иначе поиск по избранному нашёл бы всю библиотеку.
    const bookmarkIds =
      filters.bookmarked === 'true' && viewerId
        ? await this.bookmarks.entryIds(viewerId)
        : null;
    const searchIds = await this.searchIds(filters.q);
    const idFilter = intersectIds(bookmarkIds, searchIds);
    if (idFilter) {
      if (idFilter.length === 0) {
        return { items: [], nextCursor: null, total: 0 };
      }
      where.id = { in: idFilter };
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

    const marked = viewerId
      ? await this.bookmarks.markedAmong(
          viewerId,
          page.map((row) => row.id),
        )
      : new Set<string>();

    return {
      items: page.map((row) =>
        toEntryDto(row, marked.has(row.id), viewerId, viewerIsAdmin),
      ),
      nextCursor:
        hasMore && last
          ? encodeCursor({ publishedAt: last.publishedAt, id: last.id })
          : null,
      total,
    };
  }

  async byId(
    id: string,
    viewerId?: string,
    viewerIsAdmin = false,
  ): Promise<LibraryEntryDto> {
    const entry = await this.prisma.libraryEntry.findUnique({
      where: { id },
      select: ENTRY_SELECT,
    });
    if (!entry || entry.status !== 'published') {
      throw new NotFoundException('entry_not_found');
    }
    const marked = viewerId
      ? await this.bookmarks.markedAmong(viewerId, [entry.id])
      : new Set<string>();
    return toEntryDto(entry, marked.has(entry.id), viewerId, viewerIsAdmin);
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

/** `null` — ограничений по id нет; массив — итоговый набор. */
function intersectIds(
  left: string[] | null,
  right: string[] | null,
): string[] | null {
  if (!left) return right;
  if (!right) return left;
  const known = new Set(right);
  return left.filter((id) => known.has(id));
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

function toEntryDto(
  entry: EntryRow,
  bookmarked = false,
  viewerId?: string,
  viewerIsAdmin = false,
): LibraryEntryDto {
  return {
    id: entry.id,
    url: entry.url,
    domain: entry.domain,
    source: entry.source,
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
    bookmarkCount: entry.bookmarkCount,
    commentsCount: entry.commentsCount,
    bookmarked,
    publishedAt: entry.publishedAt.toISOString(),
    categories: entry.categories.map((link) => ({
      id: link.category.id,
      slug: link.category.slug,
      titleRu: link.category.titleRu,
      titleEn: link.category.titleEn,
    })),
    addedBy: entry.addedBy
      ? { id: entry.addedBy.id, name: resolveDisplayName(entry.addedBy) }
      : null,
    community: entry.community
      ? {
          id: entry.community.id,
          slug: entry.community.slug,
          name: entry.community.name,
        }
      : null,
    canEdit:
      viewerIsAdmin || (Boolean(viewerId) && entry.addedBy?.id === viewerId),
    hasCustomPreview: entry.previewIsCustom,
  };
}
