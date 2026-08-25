import { BadRequestException, Injectable } from '@nestjs/common';
import type { UnionFavoritesResponse } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Избранное среди входящих лайков: личная отметка «этот особенно
 * понравился», чтобы разобрать кучу заявок. Отмеченному она не видна и
 * ничего для него не меняет — это заметка для себя, а не второй сорт лайка.
 */
@Injectable()
export class UnionFavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async add(ownerId: string, targetUserId: string): Promise<void> {
    if (ownerId === targetUserId) {
      throw new BadRequestException('cannot_favorite_yourself');
    }
    // upsert, а не create: повторное нажатие на уже отмеченной карточке —
    // обычное дело, и падать на уникальном индексе оно не должно.
    await this.prisma.unionFavorite.upsert({
      where: {
        ownerId_favoriteUserId: { ownerId, favoriteUserId: targetUserId },
      },
      create: { ownerId, favoriteUserId: targetUserId },
      update: {},
    });
  }

  async remove(ownerId: string, targetUserId: string): Promise<void> {
    // deleteMany, а не delete: отсутствующая пара — не ошибка, звёздочку
    // могли снять дважды.
    await this.prisma.unionFavorite.deleteMany({
      where: { ownerId, favoriteUserId: targetUserId },
    });
  }

  /**
   * Только id. Данные о людях сюда не попадают намеренно: карточки в разделе
   * «Лайки» уже загружены заявками, а второй источник тех же сведений — ещё
   * одно место, где можно случайно обойти приватность.
   */
  async list(ownerId: string): Promise<UnionFavoritesResponse> {
    const rows = await this.prisma.unionFavorite.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      select: { favoriteUserId: true },
    });
    return { userIds: rows.map((row) => row.favoriteUserId) };
  }
}
