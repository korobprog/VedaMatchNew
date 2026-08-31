import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  MotivationCategoryDto,
  MotivationCategoryInput,
  MotivationCategoryUpdate,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { isAdmin } from './is-admin';
import {
  buildMotivationCategorySlug,
  withCategorySlugSuffix,
} from './category-slug';

/** Слаг, который проставлялся постам до появления справочника. */
export const FALLBACK_CATEGORY_SLUG = 'verified_quote';

type CategoryRow = {
  id: string;
  slug: string;
  title: string;
  sortOrder: number;
  isDefault: boolean;
  parentId: string | null;
};

@Injectable()
export class MotivationCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Плоский список в порядке обхода дерева: категория верхнего уровня, следом
   * её подкатегории. Клиенту остаётся сгруппировать по `parentId`.
   */
  async list(user: AccessTokenPayload): Promise<MotivationCategoryDto[]> {
    this.admin(user);
    const [categories, counts] = await Promise.all([
      this.prisma.motivationCategory.findMany({
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
      }),
      this.prisma.motivationPost.groupBy({
        by: ['category'],
        _count: { _all: true },
      }),
    ]);
    const countBySlug = new Map(
      counts.map((row) => [row.category, row._count._all]),
    );
    const withCounts = categories.map((category) => ({
      ...this.dto(category),
      postCount: countBySlug.get(category.slug) ?? 0,
    }));
    return this.inTreeOrder(withCounts);
  }

  async create(
    user: AccessTokenPayload,
    input: MotivationCategoryInput,
  ): Promise<MotivationCategoryDto> {
    this.admin(user);
    const title = input.title?.trim();
    if (!title) throw new BadRequestException('Category title is required');
    const parentId = await this.resolveParentId(input.parentId, null);

    const slug = await this.uniqueSlug(buildMotivationCategorySlug(title));
    const [last, total] = await Promise.all([
      this.prisma.motivationCategory.findFirst({
        where: { parentId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      }),
      this.prisma.motivationCategory.count(),
    ]);
    const created = await this.prisma.motivationCategory.create({
      data: {
        slug,
        title,
        parentId,
        sortOrder: (last?.sortOrder ?? 0) + 10,
        // Первая созданная категория становится дефолтной, иначе новым постам
        // некуда попадать.
        isDefault: total === 0,
      },
    });
    return { ...this.dto(created), postCount: 0 };
  }

  async update(
    user: AccessTokenPayload,
    id: string,
    input: MotivationCategoryUpdate,
  ): Promise<MotivationCategoryDto> {
    this.admin(user);
    const existing = await this.prisma.motivationCategory.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Category not found');

    const title = input.title?.trim();
    if (input.title !== undefined && !title)
      throw new BadRequestException('Category title is required');
    if (input.isDefault === false && existing.isDefault)
      throw new BadRequestException(
        'Pick another default category instead of clearing this one',
      );

    const parentId =
      input.parentId === undefined
        ? undefined
        : await this.resolveParentId(input.parentId, id);
    if (parentId) await this.assertHasNoChildren(id);

    const updated = await this.prisma.$transaction(async (transaction) => {
      if (input.isDefault === true && !existing.isDefault) {
        await transaction.motivationCategory.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }
      return transaction.motivationCategory.update({
        where: { id },
        data: {
          ...(title ? { title } : {}),
          ...(input.sortOrder === undefined
            ? {}
            : { sortOrder: input.sortOrder }),
          ...(input.isDefault === true ? { isDefault: true } : {}),
          ...(parentId === undefined ? {} : { parentId }),
        },
      });
    });
    return {
      ...this.dto(updated),
      postCount: await this.countPosts(updated.slug),
    };
  }

  /**
   * Удаление не трогает посты: они сохраняют слаг, который просто пропадает из
   * выбора. Подкатегории всплывают на верхний уровень (FK `ON DELETE SET NULL`)
   * — иначе одно нажатие уносило бы целую ветку.
   */
  async remove(user: AccessTokenPayload, id: string): Promise<void> {
    this.admin(user);
    const existing = await this.prisma.motivationCategory.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Category not found');
    if (existing.isDefault)
      throw new BadRequestException('The default category cannot be deleted');
    await this.prisma.motivationCategory.delete({ where: { id } });
  }

  /** Слаг для новых постов; при пустом справочнике — исторический fallback. */
  async defaultSlug(): Promise<string> {
    const preferred = await this.prisma.motivationCategory.findFirst({
      where: { isDefault: true },
      select: { slug: true },
    });
    if (preferred) return preferred.slug;
    const any = await this.prisma.motivationCategory.findFirst({
      orderBy: { sortOrder: 'asc' },
      select: { slug: true },
    });
    return any?.slug ?? FALLBACK_CATEGORY_SLUG;
  }

  /**
   * Приводит присланный слаг к существующей категории. Неизвестный слаг —
   * ошибка, а не молчаливое создание: иначе опечатка заводит новую категорию.
   */
  async resolveSlug(slug: string | undefined): Promise<string> {
    const trimmed = slug?.trim();
    if (!trimmed) return this.defaultSlug();
    const found = await this.prisma.motivationCategory.findUnique({
      where: { slug: trimmed },
      select: { slug: true },
    });
    if (!found) throw new BadRequestException('Unknown category');
    return found.slug;
  }

  /** Родитель верхнего уровня или null. Глубже второго уровня не пускаем. */
  private async resolveParentId(
    parentId: string | null | undefined,
    selfId: string | null,
  ): Promise<string | null> {
    if (!parentId) return null;
    if (parentId === selfId)
      throw new BadRequestException('A category cannot be its own parent');
    const parent = await this.prisma.motivationCategory.findUnique({
      where: { id: parentId },
      select: { id: true, parentId: true },
    });
    if (!parent) throw new NotFoundException('Parent category not found');
    if (parent.parentId)
      throw new BadRequestException(
        'Subcategories cannot be nested any deeper',
      );
    return parent.id;
  }

  private async assertHasNoChildren(id: string): Promise<void> {
    const child = await this.prisma.motivationCategory.findFirst({
      where: { parentId: id },
      select: { id: true },
    });
    if (child)
      throw new BadRequestException(
        'Move the subcategories out before nesting this category',
      );
  }

  private inTreeOrder(
    categories: MotivationCategoryDto[],
  ): MotivationCategoryDto[] {
    const childrenByParent = new Map<string, MotivationCategoryDto[]>();
    for (const category of categories) {
      if (!category.parentId) continue;
      const siblings = childrenByParent.get(category.parentId) ?? [];
      siblings.push(category);
      childrenByParent.set(category.parentId, siblings);
    }
    return categories
      .filter((category) => !category.parentId)
      .flatMap((parent) => [
        parent,
        ...(childrenByParent.get(parent.id) ?? []),
      ]);
  }

  private async countPosts(slug: string): Promise<number> {
    return this.prisma.motivationPost.count({ where: { category: slug } });
  }

  private async uniqueSlug(base: string): Promise<string> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = withCategorySlugSuffix(base, attempt);
      const taken = await this.prisma.motivationCategory.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new BadRequestException('Could not derive a free category slug');
  }

  private dto(category: CategoryRow): Omit<MotivationCategoryDto, 'postCount'> {
    return {
      id: category.id,
      slug: category.slug,
      title: category.title,
      sortOrder: category.sortOrder,
      isDefault: category.isDefault,
      parentId: category.parentId,
    };
  }

  private admin(user: AccessTokenPayload) {
    if (!isAdmin(user)) throw new ForbiddenException();
  }
}
