import { Injectable } from '@nestjs/common';
import type { MarketShopStatsDto } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

const TOP_LISTINGS = 5;

/**
 * Статистика витрины для владельца. Считается по денормализованным счётчикам,
 * которые уже ведёт сервис объявлений: отдельной таблицы событий ради пяти
 * чисел на дашборде не заводим.
 */
@Injectable()
export class MarketStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async forShop(shopId: string): Promise<MarketShopStatsDto> {
    const [aggregate, published, top] = await Promise.all([
      this.prisma.marketListing.aggregate({
        where: { shopId },
        _sum: { viewsCount: true, favoritesCount: true, ordersCount: true },
      }),
      this.prisma.marketListing.count({ where: { shopId, status: 'published' } }),
      this.prisma.marketListing.findMany({
        where: { shopId },
        orderBy: [{ viewsCount: 'desc' }, { id: 'desc' }],
        take: TOP_LISTINGS,
        select: {
          id: true,
          titleRu: true,
          titleEn: true,
          viewsCount: true,
          favoritesCount: true,
          ordersCount: true,
        },
      }),
    ]);

    const viewsTotal = aggregate._sum.viewsCount ?? 0;
    const ordersTotal = aggregate._sum.ordersCount ?? 0;

    return {
      shopId,
      listingsPublished: published,
      viewsTotal,
      favoritesTotal: aggregate._sum.favoritesCount ?? 0,
      ordersTotal,
      conversion: conversionRate(ordersTotal, viewsTotal),
      topListings: top.map((listing) => ({
        id: listing.id,
        // Заголовок может быть только на одном языке — берём тот, что есть.
        title: listing.titleRu ?? listing.titleEn ?? '',
        viewsCount: listing.viewsCount,
        favoritesCount: listing.favoritesCount,
        ordersCount: listing.ordersCount,
      })),
    };
  }
}

/**
 * Доля просмотров, дошедших до заявки. При нуле просмотров возвращает 0,
 * а не NaN: делить не на что, и «конверсия не определена» на дашборде
 * читается как ноль, а не как поломка.
 */
export function conversionRate(orders: number, views: number): number {
  if (views <= 0) return 0;
  return Math.round((orders / views) * 1000) / 1000;
}
