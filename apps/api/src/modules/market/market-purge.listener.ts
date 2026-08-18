import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Портал просит сервисы отдать ключи объектов удаляемого аккаунта.
 * Имя события дублируется в каждом сервисе — модули не импортируют друг друга.
 */
const USER_PURGE_REQUESTED = 'portal.user.purge-requested';

interface UserPurgeRequested {
  userId: string;
}

/**
 * Строки Market снесёт каскад от `User` (магазин, объявления, заказы, чаты),
 * а вот картинки в S3 каскадом не удаляются. Портал спрашивает ключи до
 * удаления строки — после каскада искать их будет негде — и чистит бакет сам,
 * когда удаление прошло.
 */
@Injectable()
export class MarketPurgeListener {
  private readonly logger = new Logger(MarketPurgeListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(USER_PURGE_REQUESTED)
  async collectStorageKeys(event: UserPurgeRequested) {
    const shop = await this.prisma.marketShop.findUnique({
      where: { ownerId: event.userId },
      select: {
        logoKey: true,
        coverKey: true,
        listings: { select: { images: { select: { storageKey: true } } } },
      },
    });
    if (!shop) return { storageKeys: [], counts: { listings: 0 } };

    const storageKeys = [
      ...(shop.logoKey ? [shop.logoKey] : []),
      ...(shop.coverKey ? [shop.coverKey] : []),
      ...shop.listings.flatMap((listing) =>
        listing.images.map((image) => image.storageKey),
      ),
    ];
    this.logger.log(
      `Магазин пользователя ${event.userId} уходит вместе с ${shop.listings.length} объявлениями и ${storageKeys.length} картинками`,
    );

    return { storageKeys, counts: { listings: shop.listings.length } };
  }
}
