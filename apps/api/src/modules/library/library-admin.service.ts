import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import type {
  AdminAuditEvent,
  LibraryAdminCategoryDto,
  LibraryAdminDuplicateGroup,
  LibraryAdminEntryDto,
  LibraryAdminEntryListResponse,
  LibraryAdminEntryQuery,
  LibraryAdminStats,
  LibraryCategoryAncestor,
  MergeLibraryCategoryRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { buildEntryWhere, groupDuplicates } from './library-admin-query';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const categorySelect = {
  id: true,
  parentId: true,
  path: true,
  slug: true,
  titleRu: true,
  titleEn: true,
  status: true,
  entriesCount: true,
  followersCount: true,
  normalizedRu: true,
  mergedIntoId: true,
  createdAt: true,
  createdBy: { select: { name: true } },
} satisfies Prisma.LibraryCategorySelect;

type CategoryRow = Prisma.LibraryCategoryGetPayload<{
  select: typeof categorySelect;
}>;

const entrySelect = {
  id: true,
  url: true,
  domain: true,
  type: true,
  titleRu: true,
  titleEn: true,
  status: true,
  enrichmentStatus: true,
  enrichmentError: true,
  previewUrl: true,
  usefulCount: true,
  commentsCount: true,
  createdAt: true,
  addedBy: { select: { name: true } },
  categories: {
    select: { category: { select: { titleRu: true, slug: true } } },
  },
} satisfies Prisma.LibraryEntrySelect;

type EntryRow = Prisma.LibraryEntryGetPayload<{ select: typeof entrySelect }>;

/**
 * Администрирование каталога Library. Главное здесь — слияние категорий:
 * заводить их может любой участник, а `findSimilar` при создании только
 * предупреждает о похожих, так что дубли накапливаются сами.
 */
@Injectable()
export class LibraryAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async stats(): Promise<LibraryAdminStats> {
    const [
      entriesTotal,
      published,
      removed,
      notEnriched,
      categoriesTotal,
      active,
      merged,
      roots,
      duplicates,
    ] = await Promise.all([
      this.prisma.libraryEntry.count(),
      this.prisma.libraryEntry.count({ where: { status: 'published' } }),
      this.prisma.libraryEntry.count({ where: { status: 'removed_by_admin' } }),
      this.prisma.libraryEntry.count({
        where: { enrichmentStatus: { not: 'ready' } },
      }),
      this.prisma.libraryCategory.count(),
      this.prisma.libraryCategory.count({ where: { status: 'active' } }),
      this.prisma.libraryCategory.count({ where: { status: 'merged' } }),
      this.prisma.libraryCategory.count({ where: { parentId: null } }),
      this.duplicates().then((groups) => groups.length),
    ]);

    return {
      entries: { total: entriesTotal, published, removed, notEnriched },
      categories: {
        total: categoriesTotal,
        active,
        merged,
        duplicates,
      },
      roots,
    };
  }

  async listCategories(parentId?: string): Promise<LibraryAdminCategoryDto[]> {
    const rows = await this.prisma.libraryCategory.findMany({
      where: {
        status: 'active',
        ...(parentId ? { parentId } : {}),
      },
      orderBy: [{ entriesCount: 'desc' }, { createdAt: 'asc' }],
      take: 500,
      select: categorySelect,
    });
    const ancestors = await this.ancestorsFor(rows);
    return rows.map((row) => toCategoryDto(row, ancestors));
  }

  /**
   * Предки для хлебных крошек в админском списке.
   *
   * Одним запросом на страницу: без пути две одноимённые рубрики из разных
   * веток в списке дублей неразличимы, а именно их там и разводят.
   */
  private async ancestorsFor(
    rows: Array<{ path: string }>,
  ): Promise<Map<string, LibraryCategoryAncestor>> {
    const ids = [
      ...new Set(rows.flatMap((row) => row.path.split('.').filter(Boolean))),
    ];
    if (ids.length === 0) return new Map();

    const found = await this.prisma.libraryCategory.findMany({
      where: { id: { in: ids } },
      select: { id: true, slug: true, titleRu: true, titleEn: true },
    });
    return new Map(found.map((row) => [row.id, row]));
  }

  /**
   * Дубли: активные категории с одинаковым нормализованным названием. Группы
   * собираются в памяти — активных категорий сотни, а не миллионы, и такой
   * группировки Prisma всё равно не умеет.
   */
  async duplicates(): Promise<LibraryAdminDuplicateGroup[]> {
    const rows = await this.prisma.libraryCategory.findMany({
      where: { status: 'active', normalizedRu: { not: '' } },
      orderBy: [{ entriesCount: 'desc' }, { createdAt: 'asc' }],
      select: categorySelect,
    });
    const ancestors = await this.ancestorsFor(rows);
    return groupDuplicates(
      rows.map((row) => ({ row, key: row.normalizedRu })),
    ).map((group) => ({
      normalized: group.key,
      categories: group.rows.map((row) => toCategoryDto(row, ancestors)),
    }));
  }

  /**
   * Слияние дубля. Записи переезжают в целевую категорию, исходная получает
   * статус `merged` и ссылку на неё. Счётчики пересчитываются реальным
   * `count`, а не арифметикой: часть записей уже могла быть в обеих.
   */
  async mergeCategory(
    adminId: string,
    id: string,
    body: MergeLibraryCategoryRequest,
  ): Promise<LibraryAdminCategoryDto> {
    const targetId = body?.targetId;
    if (!targetId) throw new BadRequestException('Не выбрана категория-цель');
    if (targetId === id) {
      throw new BadRequestException(
        'Категория не может быть слита сама в себя',
      );
    }

    const [source, target] = await Promise.all([
      this.prisma.libraryCategory.findUnique({ where: { id } }),
      this.prisma.libraryCategory.findUnique({ where: { id: targetId } }),
    ]);
    if (!source || !target) throw new NotFoundException('Категория не найдена');
    if (source.status !== 'active' || target.status !== 'active') {
      throw new BadRequestException('Сливать можно только активные категории');
    }

    await this.prisma.$transaction(async (tx) => {
      const links = await tx.libraryEntryCategory.findMany({
        where: { categoryId: id },
        select: { entryId: true, addedById: true },
      });

      // skipDuplicates: запись могла лежать в обеих категориях сразу, и её
      // связь с целевой уже существует.
      await tx.libraryEntryCategory.createMany({
        data: links.map((link) => ({
          entryId: link.entryId,
          categoryId: targetId,
          addedById: link.addedById,
        })),
        skipDuplicates: true,
      });
      await tx.libraryEntryCategory.deleteMany({ where: { categoryId: id } });

      const entriesCount = await tx.libraryEntryCategory.count({
        where: { categoryId: targetId },
      });
      await tx.libraryCategory.update({
        where: { id: targetId },
        data: { entriesCount },
      });
      await tx.libraryCategory.update({
        where: { id },
        data: { status: 'merged', mergedIntoId: targetId, entriesCount: 0 },
      });
    });

    const event: AdminAuditEvent = {
      actorId: adminId,
      action: 'library.category-merged',
      targetType: 'platform',
      targetId: id,
      details: {
        from: source.titleRu ?? source.slug,
        to: target.titleRu ?? target.slug,
      },
    };
    this.events.emit('admin.action', event);

    const row = await this.prisma.libraryCategory.findUniqueOrThrow({
      where: { id },
      select: categorySelect,
    });
    return toCategoryDto(row, await this.ancestorsFor([row]));
  }

  async listEntries(
    query: LibraryAdminEntryQuery,
  ): Promise<LibraryAdminEntryListResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE),
    );
    const where = buildEntryWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.libraryEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: entrySelect,
      }),
      this.prisma.libraryEntry.count({ where }),
    ]);

    return {
      items: rows.map(toEntryDto),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * Снять запись с публикации. Отдельно от пользовательского удаления: то
   * доступно автору и стирает запись, а это решение администрации, и его
   * можно отменить.
   */
  async setEntryStatus(
    adminId: string,
    id: string,
    removed: boolean,
  ): Promise<LibraryAdminEntryDto> {
    const existing = await this.prisma.libraryEntry.findUnique({
      where: { id },
      select: { id: true, status: true, titleRu: true, url: true },
    });
    if (!existing) throw new NotFoundException('Запись не найдена');

    await this.prisma.libraryEntry.update({
      where: { id },
      data: { status: removed ? 'removed_by_admin' : 'published' },
    });

    const event: AdminAuditEvent = {
      actorId: adminId,
      action: removed ? 'library.entry-removed' : 'library.entry-restored',
      targetType: 'platform',
      targetId: id,
      details: { title: existing.titleRu ?? existing.url },
    };
    this.events.emit('admin.action', event);

    const row = await this.prisma.libraryEntry.findUniqueOrThrow({
      where: { id },
      select: entrySelect,
    });
    return toEntryDto(row);
  }
}

function toCategoryDto(
  row: CategoryRow,
  ancestorsById: Map<string, LibraryCategoryAncestor>,
): LibraryAdminCategoryDto {
  return {
    id: row.id,
    parentId: row.parentId,
    ancestors: row.path
      .split('.')
      .filter(Boolean)
      .map((id) => ancestorsById.get(id))
      .filter((value): value is LibraryCategoryAncestor => Boolean(value)),
    slug: row.slug,
    titleRu: row.titleRu,
    titleEn: row.titleEn,
    status: row.status,
    entriesCount: row.entriesCount,
    followersCount: row.followersCount,
    mergedIntoId: row.mergedIntoId,
    createdByName: row.createdBy?.name ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toEntryDto(row: EntryRow): LibraryAdminEntryDto {
  return {
    id: row.id,
    url: row.url,
    domain: row.domain,
    type: row.type,
    titleRu: row.titleRu,
    titleEn: row.titleEn,
    status: row.status,
    enrichmentStatus: row.enrichmentStatus,
    enrichmentError: row.enrichmentError,
    previewUrl: row.previewUrl,
    addedByName: row.addedBy?.name ?? null,
    categories: row.categories.map(
      (link) => link.category.titleRu ?? link.category.slug,
    ),
    usefulCount: row.usefulCount,
    commentsCount: row.commentsCount,
    createdAt: row.createdAt.toISOString(),
  };
}
