import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { isPubliclyVisible } from './market-availability';

/**
 * Избранное покупателя.
 *
 * Повторное добавление и повторное удаление не считаются ошибкой: кнопку
 * нажимают дважды, а счётчик на объявлении обязан остаться верным, поэтому
 * трогаем его только когда строка действительно появилась или исчезла.
 */
@Injectable()
export class MarketFavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async add(userId: string, listingId: string): Promise<void> {
    const listing = await this.prisma.marketListing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        status: true,
        priceMinor: true,
        shop: { select: { status: true } },
      },
    });
    if (
      !listing ||
      !isPubliclyVisible({ status: listing.status, shopStatus: listing.shop.status })
    ) {
      throw new NotFoundException('listing_not_found');
    }

    const existing = await this.prisma.marketFavorite.findUnique({
      where: { userId_listingId: { userId, listingId } },
      select: { listingId: true },
    });
    if (existing) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.marketFavorite.create({
        data: {
          userId,
          listingId,
          // Снимок цены — база для уведомления «стало дешевле» в третьей фазе.
          // Без него сравнивать будет не с чем: цену объявления перепишут.
          priceAtFavorite: listing.priceMinor,
        },
      });
      await tx.marketListing.update({
        where: { id: listingId },
        data: { favoritesCount: { increment: 1 } },
      });
    });
  }

  async remove(userId: string, listingId: string): Promise<void> {
    const removed = await this.prisma.marketFavorite.deleteMany({
      where: { userId, listingId },
    });
    if (removed.count === 0) return;
    await this.prisma.marketListing.update({
      where: { id: listingId },
      data: { favoritesCount: { decrement: 1 } },
    });
  }

  /** Идентификаторы объявлений из списка, отмеченных пользователем. */
  async markedAmong(userId: string, listingIds: string[]): Promise<Set<string>> {
    if (listingIds.length === 0) return new Set();
    const rows = await this.prisma.marketFavorite.findMany({
      where: { userId, listingId: { in: listingIds } },
      select: { listingId: true },
    });
    return new Set(rows.map((row) => row.listingId));
  }
}
