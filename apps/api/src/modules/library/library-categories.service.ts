import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateLibraryCategoryConflict,
  CreateLibraryCategoryRequest,
  LibraryCategoryAncestor,
  LibraryCategoryDto,
  LibraryCategoryPageDto,
  LibraryCategorySuggestion,
  LibraryCategoryTreeNode,
  MoveLibraryCategoryRequest,
  UpdateLibraryCategoryRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildCategorySlug,
  normalizeTitle,
  withSlugSuffix,
} from './category-slug';
import {
  childPath,
  depthOf,
  isMoveRejection,
  planMove,
  type TreeRow,
} from './category-tree';

/** Выше этого сходства создание требует явного подтверждения пользователем. */
export const SIMILARITY_BLOCK_THRESHOLD = 0.75;
/** Порог для подсказок в форме: шире, чтобы показать варианты. */
const SIMILARITY_SUGGEST_THRESHOLD = 0.3;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_SLUG_ATTEMPTS = 20;
/** Создавать глубже этого уровня нечего: ниже уже некуда вкладывать. */
const MAX_CREATE_DEPTH = 2;

interface SuggestionRow {
  id: string;
  slug: string;
  titleRu: string | null;
  titleEn: string | null;
  path: string;
  entriesCount: number;
  similarity: number;
}

/** Строка дерева со всем, что нужно и для DTO, и для планировщика переезда. */
type CategoryRow = TreeRow & {
  slug: string;
  titleRu: string | null;
  titleEn: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  iconKey: string | null;
  entriesCount: number;
  createdAt: Date;
  createdById: string | null;
};

const CATEGORY_SELECT = {
  id: true,
  parentId: true,
  path: true,
  position: true,
  slug: true,
  titleRu: true,
  titleEn: true,
  descriptionRu: true,
  descriptionEn: true,
  iconKey: true,
  entriesCount: true,
  createdAt: true,
  createdById: true,
} satisfies Prisma.LibraryCategorySelect;

@Injectable()
export class LibraryCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Всё дерево одним ответом.
   *
   * Рубрик десятки, не тысячи, и любой экран справочника показывает сразу
   * несколько уровней: ленивая догрузка по клику здесь дала бы только
   * лишние круги до сервера.
   */
  async tree(
    viewerId?: string,
    viewerCanMove = false,
    viewerIsAdmin = false,
  ): Promise<LibraryCategoryTreeNode[]> {
    const rows = await this.activeRows();
    const counts = await this.subtreeCounts();

    const byParent = new Map<string | null, CategoryRow[]>();
    for (const row of rows) {
      const bucket = byParent.get(row.parentId) ?? [];
      bucket.push(row);
      byParent.set(row.parentId, bucket);
    }
    for (const bucket of byParent.values()) {
      bucket.sort((left, right) => left.position - right.position);
    }

    const build = (parentId: string | null): LibraryCategoryTreeNode[] =>
      (byParent.get(parentId) ?? []).map((row) => ({
        ...toCategoryDto(row, {
          subtreeEntriesCount: counts.get(row.id) ?? row.entriesCount,
          childrenCount: (byParent.get(row.id) ?? []).length,
          viewerId,
          viewerCanMove,
          viewerIsAdmin,
        }),
        children: build(row.id),
      }));

    return build(null);
  }

  /** Рубрика с хлебными крошками и прямыми детьми — данные её страницы. */
  async page(
    slug: string,
    viewerId?: string,
    viewerCanMove = false,
    viewerIsAdmin = false,
  ): Promise<LibraryCategoryPageDto> {
    const rows = await this.activeRows();
    const target = rows.find((row) => row.slug === slug);
    if (!target) throw new NotFoundException('category_not_found');

    const counts = await this.subtreeCounts();
    const byId = new Map(rows.map((row) => [row.id, row]));
    const childrenOf = (id: string) =>
      rows
        .filter((row) => row.parentId === id)
        .sort((left, right) => left.position - right.position);

    const toDto = (row: CategoryRow): LibraryCategoryDto =>
      toCategoryDto(row, {
        subtreeEntriesCount: counts.get(row.id) ?? row.entriesCount,
        childrenCount: childrenOf(row.id).length,
        viewerId,
        viewerCanMove,
        viewerIsAdmin,
      });

    const ancestors: LibraryCategoryAncestor[] = target.path
      .split('.')
      .filter(Boolean)
      .map((id) => byId.get(id))
      .filter((row): row is CategoryRow => Boolean(row))
      .map(toAncestor);

    return {
      category: toDto(target),
      ancestors,
      children: childrenOf(target.id).map(toDto),
    };
  }

  /**
   * Идентификаторы рубрики и всех её потомков — фильтр ленты по поддереву.
   *
   * Без потомков вложение прятало бы материалы: человек убирает рубрику
   * внутрь другой и обнаруживает, что лента родителя пуста.
   */
  async subtreeIds(slug: string): Promise<string[]> {
    const target = await this.prisma.libraryCategory.findUnique({
      where: { slug },
      select: { id: true, path: true, status: true },
    });
    if (!target || target.status !== 'active') {
      throw new NotFoundException('category_not_found');
    }

    const descendants = await this.prisma.libraryCategory.findMany({
      where: {
        status: 'active',
        path: { startsWith: childPath(target) },
      },
      select: { id: true },
    });

    return [target.id, ...descendants.map((row) => row.id)];
  }

  async suggest(query: string): Promise<LibraryCategorySuggestion[]> {
    const normalized = normalizeTitle(query);
    if (normalized.length < 3) return [];
    return this.findSimilar(normalized, SIMILARITY_SUGGEST_THRESHOLD);
  }

  async create(
    userId: string,
    viewerIsAdmin: boolean,
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

    // Верхний уровень — заранее продуманный список рубрик, его заводит
    // только администрация. Остальным для этого есть заявка.
    if (!body.parentId && !viewerIsAdmin) {
      throw new ForbiddenException('not_admin');
    }

    const parent = body.parentId
      ? await this.prisma.libraryCategory.findUnique({
          where: { id: body.parentId },
          select: { id: true, path: true, status: true },
        })
      : null;
    if (body.parentId && (!parent || parent.status !== 'active')) {
      throw new NotFoundException('parent_not_found');
    }

    const path = childPath(parent);
    if (depthOf(path) > MAX_CREATE_DEPTH) {
      throw new BadRequestException('max_depth_exceeded');
    }

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

    const slug = await this.findFreeSlug(buildCategorySlug({ titleRu, titleEn }));
    const position = await this.prisma.libraryCategory.count({
      where: { parentId: body.parentId ?? null },
    });

    const created = await this.prisma.libraryCategory.create({
      data: {
        parentId: body.parentId ?? null,
        path,
        position,
        slug,
        titleRu,
        titleEn,
        descriptionRu,
        descriptionEn,
        normalizedRu,
        normalizedEn,
        createdById: userId,
      },
      select: CATEGORY_SELECT,
    });

    return toCategoryDto(created, {
      subtreeEntriesCount: 0,
      childrenCount: 0,
      viewerId: userId,
      viewerCanMove: viewerIsAdmin,
      viewerIsAdmin,
    });
  }

  /**
   * Автор рубрики и админ могут поправить название и описание. Слаг при
   * этом не пересчитывается — на него уже могли сослаться извне. Место в
   * дереве меняет `move()`, а не эта операция.
   */
  async update(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateLibraryCategoryRequest,
  ): Promise<LibraryCategoryDto> {
    const existing = await this.prisma.libraryCategory.findUnique({
      where: { id },
      select: CATEGORY_SELECT,
    });
    if (!existing) throw new NotFoundException('category_not_found');
    if (existing.createdById !== userId && !viewerIsAdmin) {
      throw new ForbiddenException('not_category_owner');
    }

    const data: Prisma.LibraryCategoryUpdateInput = {};

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
      data.normalizedRu = normalizeTitle(titleRu);
      data.normalizedEn = normalizeTitle(titleEn);
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

    // Значок — часть оформления верхнего уровня, его ставит администрация.
    if (body.iconKey !== undefined) {
      if (!viewerIsAdmin) throw new ForbiddenException('not_admin');
      data.iconKey = body.iconKey;
    }

    const updated = await this.prisma.libraryCategory.update({
      where: { id },
      data,
      select: CATEGORY_SELECT,
    });

    const childrenCount = await this.prisma.libraryCategory.count({
      where: { parentId: id, status: 'active' },
    });

    return toCategoryDto(updated, {
      subtreeEntriesCount: updated.entriesCount,
      childrenCount,
      viewerId: userId,
      viewerCanMove: viewerIsAdmin,
      viewerIsAdmin,
    });
  }

  /**
   * Переезд рубрики: новый родитель и место среди соседей.
   *
   * Проверки цикла и глубины делает `planMove` — они обязаны быть здесь, а
   * не только в интерфейсе: запрос приходит и мимо него, а кольцо в дереве
   * чинится потом руками в базе.
   */
  async move(
    viewerId: string,
    viewerCanMove: boolean,
    viewerIsAdmin: boolean,
    id: string,
    body: MoveLibraryCategoryRequest,
  ): Promise<LibraryCategoryTreeNode[]> {
    if (!viewerCanMove) throw new ForbiddenException('not_allowed_to_move');

    const rows = await this.activeRows();
    const plan = planMove(rows, id, body.parentId, body.beforeId ?? null);
    if (isMoveRejection(plan)) {
      switch (plan) {
        case 'category_not_found':
        case 'parent_not_found':
          throw new NotFoundException(plan);
        case 'move_into_own_subtree':
          throw new ConflictException(plan);
        case 'max_depth_exceeded':
          throw new BadRequestException(plan);
      }
    }

    await this.prisma.$transaction(
      plan.updates.map((update) =>
        this.prisma.libraryCategory.update({
          where: { id: update.id },
          data: {
            parentId: update.parentId,
            path: update.path,
            position: update.position,
          },
        }),
      ),
    );

    return this.tree(viewerId, viewerCanMove, viewerIsAdmin);
  }

  /**
   * Удаление рубрики — только админ и только пустой: ни детей, ни
   * материалов. FK потомков стоит `onDelete: Restrict`, но материалы
   * связаны каскадом, и снос непустой рубрики молча оборвал бы им
   * привязку. Сначала перенести содержимое, потом удалять.
   */
  async remove(viewerIsAdmin: boolean, id: string): Promise<{ ok: true }> {
    if (!viewerIsAdmin) throw new ForbiddenException('not_admin');

    const existing = await this.prisma.libraryCategory.findUnique({
      where: { id },
      select: { id: true, entriesCount: true },
    });
    if (!existing) throw new NotFoundException('category_not_found');

    const childrenCount = await this.prisma.libraryCategory.count({
      where: { parentId: id },
    });
    if (childrenCount > 0) throw new BadRequestException('category_has_children');

    const entriesCount = await this.prisma.libraryEntryCategory.count({
      where: { categoryId: id },
    });
    if (entriesCount > 0) throw new BadRequestException('category_not_empty');

    await this.prisma.libraryCategory.delete({ where: { id } });
    return { ok: true };
  }

  private async activeRows(): Promise<CategoryRow[]> {
    return this.prisma.libraryCategory.findMany({
      where: { status: 'active' },
      select: CATEGORY_SELECT,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Материалы по поддереву каждой рубрики, одним запросом.
   *
   * `COUNT(DISTINCT)`, а не сумма счётчиков предков: одна запись лежит
   * сразу в нескольких рубриках, и сложение дало бы двойной счёт. Считает
   * Postgres — выгружать все связи в память ради этого незачем.
   */
  private async subtreeCounts(): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; total: bigint }>
    >(Prisma.sql`
      SELECT anc."id", COUNT(DISTINCT ec."entryId") AS "total"
      FROM "LibraryCategory" anc
      LEFT JOIN "LibraryCategory" node
        ON node."status" = 'active'
       AND (
         node."id" = anc."id"
         OR node."path" LIKE (
           CASE WHEN anc."path" = '' THEN '.' ELSE anc."path" END
           || anc."id" || '.%'
         )
       )
      LEFT JOIN "LibraryEntryCategory" ec ON ec."categoryId" = node."id"
      LEFT JOIN "LibraryEntry" e
        ON e."id" = ec."entryId" AND e."status" = 'published'
      WHERE anc."status" = 'active' AND (ec."entryId" IS NULL OR e."id" IS NOT NULL)
      GROUP BY anc."id"
    `);

    return new Map(rows.map((row) => [row.id, Number(row.total)]));
  }

  private async findSimilar(
    normalized: string,
    threshold: number,
  ): Promise<LibraryCategorySuggestion[]> {
    if (!normalized) return [];
    const rows = await this.prisma.$queryRaw<SuggestionRow[]>(Prisma.sql`
      SELECT c."id",
             c."slug",
             c."titleRu",
             c."titleEn",
             c."path",
             c."entriesCount",
             GREATEST(
               similarity(c."normalizedRu", ${normalized}),
               similarity(c."normalizedEn", ${normalized})
             ) AS "similarity"
      FROM "LibraryCategory" c
      WHERE c."status" = 'active'
        AND GREATEST(
              similarity(c."normalizedRu", ${normalized}),
              similarity(c."normalizedEn", ${normalized})
            ) >= ${threshold}
      ORDER BY "similarity" DESC
      LIMIT 5
    `);

    const ancestorIds = [
      ...new Set(rows.flatMap((row) => row.path.split('.').filter(Boolean))),
    ];
    const ancestorRows = ancestorIds.length
      ? await this.prisma.libraryCategory.findMany({
          where: { id: { in: ancestorIds } },
          select: { id: true, slug: true, titleRu: true, titleEn: true },
        })
      : [];
    const byId = new Map(ancestorRows.map((row) => [row.id, row]));

    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      titleRu: row.titleRu,
      titleEn: row.titleEn,
      ancestors: row.path
        .split('.')
        .filter(Boolean)
        .map((id) => byId.get(id))
        .filter((value): value is LibraryCategoryAncestor => Boolean(value)),
      entriesCount: Number(row.entriesCount),
      similarity: Number(row.similarity),
    }));
  }

  /** Слаг теперь уникален глобально: адрес рубрики не зависит от места. */
  private async findFreeSlug(baseSlug: string): Promise<string> {
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
      const candidate = withSlugSuffix(baseSlug, attempt);
      const taken = await this.prisma.libraryCategory.findUnique({
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

function toAncestor(row: CategoryRow): LibraryCategoryAncestor {
  return {
    id: row.id,
    slug: row.slug,
    titleRu: row.titleRu,
    titleEn: row.titleEn,
  };
}

function toCategoryDto(
  category: Omit<CategoryRow, 'createdById'> & { createdById?: string | null },
  context: {
    subtreeEntriesCount: number;
    childrenCount: number;
    viewerId?: string;
    viewerCanMove: boolean;
    viewerIsAdmin: boolean;
  },
): LibraryCategoryDto {
  return {
    id: category.id,
    parentId: category.parentId,
    slug: category.slug,
    titleRu: category.titleRu,
    titleEn: category.titleEn,
    descriptionRu: category.descriptionRu,
    descriptionEn: category.descriptionEn,
    iconKey: category.iconKey,
    position: category.position,
    depth: depthOf(category.path),
    entriesCount: category.entriesCount,
    subtreeEntriesCount: context.subtreeEntriesCount,
    childrenCount: context.childrenCount,
    createdAt: category.createdAt.toISOString(),
    canEdit:
      context.viewerIsAdmin ||
      (Boolean(context.viewerId) &&
        category.createdById === context.viewerId),
    canMove: context.viewerCanMove,
  };
}
