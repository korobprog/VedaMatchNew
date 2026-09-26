import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type {
  CreateLibraryShlokaRequest,
  LibraryCategoryAncestor,
  LibraryShlokaDto,
  LibraryShlokaImageDto,
  LibraryShlokaListResponse,
  PortalActivityEvent,
  UpdateLibraryShlokaRequest,
} from '@vedamatch/shared';
import {
  LIBRARY_SHLOKA_LIMITS,
  PORTAL_ACTIVITY_EVENTS,
  libraryShlokaSourceLabel,
  resolveDisplayName,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { LibraryBookmarksService } from './library-bookmarks.service';
import { LibraryPreviewsService } from './library-previews.service';
import {
  cleanAcharyas,
  cleanLine,
  cleanMultiline,
  preview,
  shlokaDescription,
  shlokaFieldsError,
  shlokaRequiredError,
  shlokaTitle,
  sourceError,
  type ShlokaTextFields,
} from './shloka-input';
import { neighborsOf, sortByVerse } from './shloka-order';

/** Строк в окне источника за раз: Гита целиком — 700 стихов. */
const LIST_PAGE_SIZE = 60;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** Картинку рассматривают во весь экран — шире обложки ленты. */
const IMAGE_WIDTH = 1600;

export interface UploadedShlokaImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

const IMAGE_SELECT = {
  id: true,
  url: true,
  width: true,
  height: true,
  acharyaId: true,
} satisfies Prisma.LibraryShlokaImageSelect;

const DETAIL_SELECT = {
  id: true,
  type: true,
  status: true,
  titleRu: true,
  source: true,
  contentLanguage: true,
  bookmarkCount: true,
  commentsCount: true,
  publishedAt: true,
  addedById: true,
  addedBy: { select: { id: true, name: true, spiritualName: true } },
  categories: {
    orderBy: { createdAt: 'asc' },
    select: {
      category: {
        select: {
          id: true,
          slug: true,
          titleRu: true,
          titleEn: true,
          status: true,
        },
      },
    },
  },
  shloka: {
    select: {
      verse: true,
      text: true,
      wordByWord: true,
      translation: true,
      commentary: true,
      images: { orderBy: { position: 'asc' }, select: IMAGE_SELECT },
      acharyas: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          acharya: true,
          text: true,
          wordByWord: true,
          translation: true,
          commentary: true,
        },
      },
    },
  },
} satisfies Prisma.LibraryEntrySelect;

type DetailRow = Prisma.LibraryEntryGetPayload<{
  select: typeof DETAIL_SELECT;
}>;

/**
 * Шлоки Образования (VED-386).
 *
 * Шлока — материал типа `shloka` плюс строка `LibraryShloka` со своими
 * полями. Источник — рубрика, в которую шлоку добавили: раздел
 * «Бхагавад-гита» внутри рубрики «Шлоки». По ней листаются стрелки и ищет
 * окно источника; строка источника у записи проставляется по ней же.
 *
 * Права — как у любого материала Образования: добавить может каждый
 * вошедший, править и удалять — автор и админ сервиса.
 */
@Injectable()
export class LibraryShlokasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly previews: LibraryPreviewsService,
    private readonly bookmarks: LibraryBookmarksService,
    private readonly events: EventEmitter2,
  ) {}

  /** Окно источника: шлоки рубрики по порядку стихов, с поиском. */
  async list(
    slug: string,
    query: string | undefined,
    offsetRaw: string | undefined,
  ): Promise<LibraryShlokaListResponse> {
    const category = await this.prisma.libraryCategory.findFirst({
      where: { slug, status: 'active' },
      select: {
        id: true,
        slug: true,
        titleRu: true,
        titleEn: true,
        path: true,
      },
    });
    if (!category) throw new NotFoundException('category_not_found');
    const ancestors = await this.ancestorsOf(category.path);

    const where: Prisma.LibraryEntryWhereInput = {
      type: 'shloka',
      status: 'published',
      categories: { some: { categoryId: category.id } },
      ...searchWhere(query),
    };
    const ordered = sortByVerse(
      (
        await this.prisma.libraryEntry.findMany({
          where,
          select: {
            id: true,
            publishedAt: true,
            shloka: { select: { verse: true } },
          },
        })
      ).map((row) => ({
        id: row.id,
        publishedAt: row.publishedAt,
        verse: row.shloka?.verse ?? null,
      })),
    );

    const offset = Math.max(0, Math.floor(Number(offsetRaw) || 0));
    const pageIds = ordered
      .slice(offset, offset + LIST_PAGE_SIZE)
      .map((row) => row.id);
    const details = await this.prisma.libraryShloka.findMany({
      where: { entryId: { in: pageIds } },
      select: {
        entryId: true,
        verse: true,
        text: true,
        translation: true,
        _count: { select: { images: true, acharyas: true } },
      },
    });
    const byId = new Map(details.map((row) => [row.entryId, row]));

    return {
      category: toAncestor(category),
      sourceLabel: libraryShlokaSourceLabel(ancestors, category),
      items: pageIds.flatMap((id) => {
        const row = byId.get(id);
        if (!row) return [];
        return [
          {
            id,
            verse: row.verse,
            text: row.text,
            translation: preview(row.translation, 240),
            imagesCount: row._count.images,
            acharyasCount: row._count.acharyas,
          },
        ];
      }),
      total: ordered.length,
      nextOffset:
        offset + LIST_PAGE_SIZE < ordered.length
          ? offset + LIST_PAGE_SIZE
          : null,
    };
  }

  /** Окно шлоки — со стрелками по источнику. */
  async byId(
    id: string,
    viewerId: string,
    viewerIsAdmin: boolean,
  ): Promise<LibraryShlokaDto> {
    const row = await this.prisma.libraryEntry.findUnique({
      where: { id },
      select: DETAIL_SELECT,
    });
    if (
      !row ||
      row.status !== 'published' ||
      row.type !== 'shloka' ||
      !row.shloka
    ) {
      throw new NotFoundException('shloka_not_found');
    }

    const category =
      row.categories
        .map((link) => link.category)
        .find((candidate) => candidate.status === 'active') ?? null;
    const siblings = category
      ? sortByVerse(
          (
            await this.prisma.libraryEntry.findMany({
              where: {
                type: 'shloka',
                status: 'published',
                categories: { some: { categoryId: category.id } },
              },
              select: {
                id: true,
                publishedAt: true,
                shloka: { select: { verse: true } },
              },
            })
          ).map((sibling) => ({
            id: sibling.id,
            publishedAt: sibling.publishedAt,
            verse: sibling.shloka?.verse ?? null,
          })),
        )
      : [];
    const around = neighborsOf(siblings, row.id);
    const marked = await this.bookmarks.markedAmong(viewerId, [row.id]);

    return toShlokaDto(row, {
      category: category ? toAncestor(category) : null,
      prev: around.prev
        ? { id: around.prev.id, verse: around.prev.verse }
        : null,
      next: around.next
        ? { id: around.next.id, verse: around.next.verse }
        : null,
      position: around.position,
      total: around.total,
      bookmarked: marked.has(row.id),
      canEdit: viewerIsAdmin || row.addedById === viewerId,
    });
  }

  async create(
    userId: string,
    viewerIsAdmin: boolean,
    body: CreateLibraryShlokaRequest,
  ): Promise<LibraryShlokaDto> {
    const categoryId =
      typeof body?.categoryId === 'string' ? body.categoryId : '';
    const category = categoryId
      ? await this.prisma.libraryCategory.findFirst({
          where: { id: categoryId, status: 'active' },
          select: { id: true, titleRu: true, titleEn: true, path: true },
        })
      : null;
    if (!category) throw new BadRequestException('category_not_found');

    // Источник проставляется по рубрике сам: человек, зашедший в раздел
    // «Бхагавад-гита», не должен писать «Бхагавад-гита» ещё раз.
    const source =
      cleanLine(body.source) ??
      libraryShlokaSourceLabel(await this.ancestorsOf(category.path), category);
    const fields: ShlokaTextFields = {
      verse: cleanLine(body.verse),
      text: cleanMultiline(body.text),
      wordByWord: cleanMultiline(body.wordByWord),
      translation: cleanMultiline(body.translation),
      commentary: cleanMultiline(body.commentary),
    };
    const error = sourceError(source) ?? shlokaRequiredError(fields);
    if (error) throw new BadRequestException(error);
    const acharyas = cleanAcharyas(body.acharyas);
    if (!acharyas.ok) throw new BadRequestException(acharyas.error);
    // Оригинал необязателен (VED-464); колонка не пустая — пустая строка.
    const text = fields.text ?? '';

    const created = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.libraryEntry.create({
        data: {
          type: 'shloka',
          source,
          titleRu: shlokaTitle(
            source,
            fields.verse,
            text || (fields.translation ?? ''),
          ),
          descriptionRu: shlokaDescription(
            fields.translation,
            fields.wordByWord,
          ),
          contentLanguage: normalizeLanguage(body.contentLanguage),
          addedById: userId,
          // Стих писания — для всех линий. Комментарий конкретного ачарьи
          // линию не меняет: он и так подписан его именем.
          lineage: null,
          enrichmentStatus: 'not_applicable',
        },
        select: { id: true },
      });
      await tx.libraryShloka.create({
        data: {
          entryId: entry.id,
          verse: fields.verse,
          text,
          wordByWord: fields.wordByWord,
          translation: fields.translation,
          commentary: fields.commentary,
          acharyas: {
            create: acharyas.acharyas.map((block, position) => ({
              acharya: block.acharya,
              text: block.text,
              wordByWord: block.wordByWord,
              translation: block.translation,
              commentary: block.commentary,
              position,
            })),
          },
        },
      });
      await tx.libraryEntryCategory.create({
        data: { entryId: entry.id, categoryId: category.id, addedById: userId },
      });
      await tx.libraryCategory.update({
        where: { id: category.id },
        data: { entriesCount: { increment: 1 } },
      });
      return entry;
    });

    const title = shlokaTitle(
      source,
      fields.verse,
      text || (fields.translation ?? ''),
    );
    const event: PortalActivityEvent = {
      name: PORTAL_ACTIVITY_EVENTS.library,
      userId,
      action: 'library.entry-created',
      occurredAt: new Date().toISOString(),
      entityId: created.id,
      entityLabel: title,
      link: `/library/entry/${created.id}`,
    };
    this.events.emit(event.name, event);

    return this.byId(created.id, userId, viewerIsAdmin);
  }

  async update(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateLibraryShlokaRequest,
  ): Promise<LibraryShlokaDto> {
    const existing = await this.editable(userId, viewerIsAdmin, id);
    const current = existing.shloka;

    const pick = (
      value: unknown,
      clean: (raw: unknown) => string | null,
      fallback: string | null,
    ) => (value === undefined ? fallback : clean(value));
    const source = pick(body.source, cleanLine, existing.source);
    const fields: ShlokaTextFields = {
      verse: pick(body.verse, cleanLine, current.verse),
      text: pick(body.text, cleanMultiline, current.text),
      wordByWord: pick(body.wordByWord, cleanMultiline, current.wordByWord),
      translation: pick(body.translation, cleanMultiline, current.translation),
      commentary: pick(body.commentary, cleanMultiline, current.commentary),
    };
    const error =
      sourceError(source) ??
      // Перевод обязателен, но шлоки, заведённые до VED-464 без него, должны
      // оставаться правимыми: требуем его, только когда запрос трогает поле.
      (body.translation === undefined
        ? shlokaFieldsError(fields)
        : shlokaRequiredError(fields));
    if (error) throw new BadRequestException(error);
    const acharyas =
      body.acharyas === undefined ? null : cleanAcharyas(body.acharyas);
    if (acharyas && !acharyas.ok) throw new BadRequestException(acharyas.error);
    // Оригинал необязателен (VED-464); колонка не пустая — пустая строка.
    const text = fields.text ?? '';
    const sourceText = source as string;

    // Блоки ачарьев: с известным id — правка, без него или с чужим id —
    // новый, пропавшие из списка — удаление вместе с их картинками.
    const knownIds = new Set(current.acharyas.map((block) => block.id));
    const nextBlocks = acharyas?.ok ? acharyas.acharyas : null;
    const keptIds = new Set(
      (nextBlocks ?? [])
        .map((block) => block.id)
        .filter((blockId): blockId is string =>
          Boolean(blockId && knownIds.has(blockId)),
        ),
    );
    const removedIds = nextBlocks
      ? [...knownIds].filter((blockId) => !keptIds.has(blockId))
      : [];
    const orphanKeys = removedIds.length
      ? (
          await this.prisma.libraryShlokaImage.findMany({
            where: { acharyaId: { in: removedIds } },
            select: { storageKey: true },
          })
        ).map((image) => image.storageKey)
      : [];

    await this.prisma.$transaction(async (tx) => {
      await tx.libraryEntry.update({
        where: { id },
        data: {
          source: sourceText,
          titleRu: shlokaTitle(
            sourceText,
            fields.verse,
            text || (fields.translation ?? ''),
          ),
          descriptionRu: shlokaDescription(
            fields.translation,
            fields.wordByWord,
          ),
          ...(body.contentLanguage !== undefined
            ? { contentLanguage: normalizeLanguage(body.contentLanguage) }
            : {}),
        },
      });
      await tx.libraryShloka.update({
        where: { entryId: id },
        data: {
          verse: fields.verse,
          text,
          wordByWord: fields.wordByWord,
          translation: fields.translation,
          commentary: fields.commentary,
        },
      });
      if (!nextBlocks) return;
      if (removedIds.length > 0) {
        await tx.libraryShlokaAcharya.deleteMany({
          where: { id: { in: removedIds }, shlokaId: id },
        });
      }
      for (const [position, block] of nextBlocks.entries()) {
        const data = {
          acharya: block.acharya,
          text: block.text,
          wordByWord: block.wordByWord,
          translation: block.translation,
          commentary: block.commentary,
          position,
        };
        if (block.id && keptIds.has(block.id)) {
          await tx.libraryShlokaAcharya.update({
            where: { id: block.id },
            data,
          });
        } else {
          await tx.libraryShlokaAcharya.create({
            data: { ...data, shlokaId: id },
          });
        }
      }
    });

    await this.removeObjects(orphanKeys);
    return this.byId(id, userId, viewerIsAdmin);
  }

  async addImage(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    file: UploadedShlokaImage | undefined,
    acharyaIdRaw: unknown,
  ): Promise<LibraryShlokaImageDto> {
    const existing = await this.editable(userId, viewerIsAdmin, id);
    if (!this.previews.configured) {
      throw new ServiceUnavailableException('image_upload_unavailable');
    }
    if (!file || file.size === 0)
      throw new BadRequestException('image_file_required');
    if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('unsupported_image_type');
    }
    if (file.size > LIBRARY_SHLOKA_LIMITS.imageBytes) {
      throw new BadRequestException('image_file_too_large');
    }
    const acharyaId =
      typeof acharyaIdRaw === 'string' && acharyaIdRaw ? acharyaIdRaw : null;
    if (
      acharyaId &&
      !existing.shloka.acharyas.some((block) => block.id === acharyaId)
    ) {
      throw new BadRequestException('acharya_not_found');
    }
    const count = await this.prisma.libraryShlokaImage.count({
      where: { shlokaId: id },
    });
    if (count >= LIBRARY_SHLOKA_LIMITS.images) {
      throw new BadRequestException('too_many_images');
    }

    let stored: Awaited<ReturnType<LibraryPreviewsService['storeImage']>>;
    try {
      stored = await this.previews.storeImage(
        `library/shlokas/${id}/${randomUUID()}.webp`,
        file.buffer,
        IMAGE_WIDTH,
      );
    } catch {
      // sharp не распознал файл: расширение картинки, а внутри не она.
      throw new BadRequestException('unsupported_image_type');
    }
    if (!stored)
      throw new ServiceUnavailableException('image_upload_unavailable');

    const last = await this.prisma.libraryShlokaImage.aggregate({
      where: { shlokaId: id, acharyaId },
      _max: { position: true },
    });
    return this.prisma.libraryShlokaImage.create({
      data: {
        shlokaId: id,
        acharyaId,
        storageKey: stored.key,
        url: stored.url,
        width: stored.width,
        height: stored.height,
        position: (last._max.position ?? -1) + 1,
      },
      select: IMAGE_SELECT,
    });
  }

  async removeImage(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    imageId: string,
  ): Promise<void> {
    await this.editable(userId, viewerIsAdmin, id);
    const image = await this.prisma.libraryShlokaImage.findFirst({
      where: { id: imageId, shlokaId: id },
      select: { id: true, storageKey: true },
    });
    if (!image) throw new NotFoundException('image_not_found');
    await this.prisma.libraryShlokaImage.delete({ where: { id: image.id } });
    await this.removeObjects([image.storageKey]);
  }

  /**
   * Ключи картинок шлоки — забрать до удаления материала: строки уходят
   * каскадом, и найти потом объекты в бакете было бы не по чему.
   */
  async imageKeysOf(entryId: string): Promise<string[]> {
    const rows = await this.prisma.libraryShlokaImage.findMany({
      where: { shlokaId: entryId },
      select: { storageKey: true },
    });
    return rows.map((row) => row.storageKey);
  }

  async removeObjects(keys: string[]): Promise<void> {
    for (const key of keys) await this.previews.remove(key);
  }

  private async editable(userId: string, viewerIsAdmin: boolean, id: string) {
    const row = await this.prisma.libraryEntry.findUnique({
      where: { id },
      select: {
        id: true,
        type: true,
        status: true,
        source: true,
        addedById: true,
        shloka: {
          select: {
            verse: true,
            text: true,
            wordByWord: true,
            translation: true,
            commentary: true,
            acharyas: { select: { id: true } },
          },
        },
      },
    });
    if (
      !row ||
      row.status !== 'published' ||
      row.type !== 'shloka' ||
      !row.shloka
    ) {
      throw new NotFoundException('shloka_not_found');
    }
    if (row.addedById !== userId && !viewerIsAdmin) {
      throw new ForbiddenException('not_entry_owner');
    }
    return { ...row, shloka: row.shloka };
  }

  /** Предки рубрики от корня — по материализованному пути. */
  private async ancestorsOf(path: string): Promise<LibraryCategoryAncestor[]> {
    const ids = path.split('.').filter(Boolean);
    if (ids.length === 0) return [];
    const rows = await this.prisma.libraryCategory.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true, titleRu: true, titleEn: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids
      .map((ancestorId) => byId.get(ancestorId))
      .filter((row): row is (typeof rows)[number] => Boolean(row))
      .map(toAncestor);
  }
}

/**
 * Поиск внутри источника: по номеру стиха, тексту, пословному, переводу,
 * комментарию и блокам ачарьев. Запрос-номер («2», «2.13») ищет по номеру:
 * «2» — вся вторая глава, «2.13» — сам стих и диапазон «2.13-14», но не
 * «12.13», которое нашлось бы простым вхождением.
 */
export function searchWhere(
  query: string | undefined,
): Prisma.LibraryEntryWhereInput {
  const trimmed = query?.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!trimmed) return {};
  if (/^\d+(?:[.:]\d+)*(?:\s*[-–]\s*\d+)?$/.test(trimmed)) {
    const verse = trimmed.replace(/:/g, '.').replace(/\s*[-–]\s*/, '-');
    return {
      shloka: {
        is: {
          OR: [
            { verse: { equals: verse, mode: 'insensitive' } },
            { verse: { startsWith: `${verse}.`, mode: 'insensitive' } },
            { verse: { startsWith: `${verse}-`, mode: 'insensitive' } },
            { verse: { endsWith: ` ${verse}`, mode: 'insensitive' } },
          ],
        },
      },
    };
  }
  const contains = { contains: trimmed, mode: 'insensitive' as const };
  return {
    OR: [
      { titleRu: contains },
      {
        shloka: {
          is: {
            OR: [
              { verse: contains },
              { text: contains },
              { wordByWord: contains },
              { translation: contains },
              { commentary: contains },
              {
                acharyas: {
                  some: {
                    OR: [
                      { acharya: contains },
                      { text: contains },
                      { wordByWord: contains },
                      { translation: contains },
                      { commentary: contains },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    ],
  };
}

function normalizeLanguage(value: unknown): string {
  const normalized =
    typeof value === 'string' ? value.trim().toLowerCase().slice(0, 8) : '';
  return normalized || 'ru';
}

function toAncestor(row: {
  id: string;
  slug: string;
  titleRu: string | null;
  titleEn: string | null;
}): LibraryCategoryAncestor {
  return {
    id: row.id,
    slug: row.slug,
    titleRu: row.titleRu,
    titleEn: row.titleEn,
  };
}

function toShlokaDto(
  row: DetailRow,
  extra: Pick<
    LibraryShlokaDto,
    | 'category'
    | 'prev'
    | 'next'
    | 'position'
    | 'total'
    | 'bookmarked'
    | 'canEdit'
  >,
): LibraryShlokaDto {
  const shloka = row.shloka!;
  const images = shloka.images;
  return {
    id: row.id,
    titleRu: row.titleRu,
    source: row.source ?? '',
    verse: shloka.verse,
    text: shloka.text,
    wordByWord: shloka.wordByWord,
    translation: shloka.translation,
    commentary: shloka.commentary,
    contentLanguage: row.contentLanguage,
    images: images.filter((image) => image.acharyaId === null),
    acharyas: shloka.acharyas.map((block) => ({
      ...block,
      images: images.filter((image) => image.acharyaId === block.id),
    })),
    bookmarkCount: row.bookmarkCount,
    commentsCount: row.commentsCount,
    addedBy: row.addedBy
      ? { id: row.addedBy.id, name: resolveDisplayName(row.addedBy) }
      : null,
    publishedAt: row.publishedAt.toISOString(),
    ...extra,
  };
}
