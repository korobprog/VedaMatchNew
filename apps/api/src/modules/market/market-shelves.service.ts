import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateMarketShelfRequest,
  MarketShelfDto,
  UpdateMarketShelfRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { buildShopSlug, withSlugSuffix } from './shop-slug';

const MAX_TITLE_LENGTH = 80;
/** Полка — навигация, а не каталог: два десятка уже нечитаемы. */
const MAX_SHELVES_PER_SHOP = 20;

/**
 * Полки магазина: собственная навигация по витрине, независимая от глобального
 * каталога. Категорию выбирает продавец из фиксированного списка, а полку
 * придумывает сам — «новинки», «к Гаура-пурниме», «остатки».
 */
@Injectable()
export class MarketShelvesService {
  constructor(private readonly prisma: PrismaService) {}

  async listByShopSlug(shopSlug: string): Promise<MarketShelfDto[]> {
    const shop = await this.prisma.marketShop.findUnique({
      where: { slug: shopSlug },
      select: { id: true },
    });
    if (!shop) throw new NotFoundException('shop_not_found');
    return this.listByShopId(shop.id);
  }

  async listByShopId(shopId: string): Promise<MarketShelfDto[]> {
    const shelves = await this.prisma.marketShelf.findMany({
      where: { shopId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return shelves.map(toShelfDto);
  }

  async create(
    shopId: string,
    body: CreateMarketShelfRequest,
  ): Promise<MarketShelfDto> {
    const { titleRu, titleEn } = this.normalizeTitles(body);

    const count = await this.prisma.marketShelf.count({ where: { shopId } });
    if (count >= MAX_SHELVES_PER_SHOP) {
      throw new BadRequestException('too_many_shelves');
    }

    const slug = await this.allocateSlug(shopId, titleEn || titleRu || 'shelf');
    const created = await this.prisma.marketShelf.create({
      data: {
        shopId,
        slug,
        titleRu,
        titleEn,
        position: body.position ?? count,
      },
    });
    return toShelfDto(created);
  }

  async update(
    shelfId: string,
    userId: string,
    viewerIsAdmin: boolean,
    body: UpdateMarketShelfRequest,
  ): Promise<MarketShelfDto> {
    const shelf = await this.assertShelfOwner(shelfId, userId, viewerIsAdmin);

    const data: {
      titleRu?: string | null;
      titleEn?: string | null;
      position?: number;
    } = {};
    if (body.titleRu !== undefined || body.titleEn !== undefined) {
      const titles = this.normalizeTitles({
        titleRu: body.titleRu !== undefined ? body.titleRu : shelf.titleRu,
        titleEn: body.titleEn !== undefined ? body.titleEn : shelf.titleEn,
      });
      data.titleRu = titles.titleRu;
      data.titleEn = titles.titleEn;
    }
    if (body.position !== undefined) data.position = body.position;

    const updated = await this.prisma.marketShelf.update({
      where: { id: shelfId },
      data,
    });
    return toShelfDto(updated);
  }

  /**
   * Удаление полки не трогает объявления: связь через MarketListingShelf
   * каскадится, товар остаётся на витрине и в каталоге. Полка — это ярлык,
   * а не контейнер.
   */
  async remove(
    shelfId: string,
    userId: string,
    viewerIsAdmin: boolean,
  ): Promise<void> {
    await this.assertShelfOwner(shelfId, userId, viewerIsAdmin);
    await this.prisma.marketShelf.delete({ where: { id: shelfId } });
  }

  /** Полка правится по своему id, поэтому владельца сверяем через магазин,
   *  а не требуем от вызывающего заранее знать shopId. */
  private async assertShelfOwner(
    shelfId: string,
    userId: string,
    viewerIsAdmin: boolean,
  ) {
    const shelf = await this.prisma.marketShelf.findUnique({
      where: { id: shelfId },
      include: { shop: { select: { ownerId: true } } },
    });
    if (!shelf) throw new NotFoundException('shelf_not_found');
    if (shelf.shop.ownerId !== userId && !viewerIsAdmin) {
      throw new ForbiddenException('not_shop_owner');
    }
    return shelf;
  }

  private normalizeTitles(body: {
    titleRu?: string | null;
    titleEn?: string | null;
  }): { titleRu: string | null; titleEn: string | null } {
    const titleRu = body.titleRu?.trim() || null;
    const titleEn = body.titleEn?.trim() || null;
    if (!titleRu && !titleEn) throw new BadRequestException('title_required');
    for (const title of [titleRu, titleEn]) {
      if (title && title.length > MAX_TITLE_LENGTH) {
        throw new BadRequestException('title_too_long');
      }
    }
    return { titleRu, titleEn };
  }

  private async allocateSlug(shopId: string, source: string): Promise<string> {
    const base = buildShopSlug(source);
    for (let attempt = 0; attempt < MAX_SHELVES_PER_SHOP + 1; attempt += 1) {
      const candidate = withSlugSuffix(base, attempt);
      const taken = await this.prisma.marketShelf.findUnique({
        where: { shopId_slug: { shopId, slug: candidate } },
        select: { id: true },
      });
      if (!taken) return candidate;
    }
    throw new BadRequestException('too_many_shelves');
  }
}

function toShelfDto(shelf: {
  id: string;
  shopId: string;
  slug: string;
  titleRu: string | null;
  titleEn: string | null;
  position: number;
  listingsCount: number;
}): MarketShelfDto {
  return {
    id: shelf.id,
    shopId: shelf.shopId,
    slug: shelf.slug,
    titleRu: shelf.titleRu,
    titleEn: shelf.titleEn,
    position: shelf.position,
    listingsCount: shelf.listingsCount,
  };
}
