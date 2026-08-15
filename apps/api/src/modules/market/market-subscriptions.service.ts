import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  CreateMarketSubscriptionRequest,
  MarketListingFilters,
  MarketSubscriptionDto,
  NotificationEvent,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { savedSearchKey, subscriptionTargetKey } from './subscription-target-key';

const MAX_SUBSCRIPTIONS = 100;
const MAX_TITLE_LENGTH = 120;

@Injectable()
export class MarketSubscriptionsService {
  private readonly logger = new Logger(MarketSubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async list(userId: string): Promise<MarketSubscriptionDto[]> {
    const rows = await this.prisma.marketSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        shop: { select: { slug: true, name: true } },
        section: { select: { slug: true, titleRu: true } },
        category: { select: { slug: true, titleRu: true } },
      },
    });
    return rows.map(toSubscriptionDto);
  }

  async create(
    userId: string,
    body: CreateMarketSubscriptionRequest,
  ): Promise<MarketSubscriptionDto> {
    const targetKey = subscriptionTargetKey({
      kind: body.kind,
      shopId: body.shopId,
      sectionId: body.sectionId,
      categoryId: body.categoryId,
      query: body.query,
    });
    if (!targetKey) throw new BadRequestException('subscription_target_required');

    const title = body.title?.trim() || null;
    if (title && title.length > MAX_TITLE_LENGTH) {
      throw new BadRequestException('title_too_long');
    }

    // Проверяем, что цель существует: подписка на удалённый магазин молча
    // не сработает, и человек будет ждать уведомлений, которых не будет.
    await this.assertTargetExists(body);

    const count = await this.prisma.marketSubscription.count({ where: { userId } });
    if (count >= MAX_SUBSCRIPTIONS) {
      throw new BadRequestException('too_many_subscriptions');
    }

    const existing = await this.prisma.marketSubscription.findUnique({
      where: {
        userId_kind_targetKey: { userId, kind: body.kind, targetKey },
      },
      select: { id: true },
    });
    if (existing) throw new ConflictException('subscription_already_exists');

    const created = await this.prisma.marketSubscription.create({
      data: {
        userId,
        kind: body.kind,
        targetKey,
        shopId: body.kind === 'shop' ? (body.shopId ?? null) : null,
        sectionId: body.kind === 'section' ? (body.sectionId ?? null) : null,
        categoryId: body.kind === 'category' ? (body.categoryId ?? null) : null,
        query:
          body.kind === 'saved_search'
            ? ((body.query ?? {}) as Prisma.InputJsonValue)
            : Prisma.DbNull,
        title,
      },
      include: {
        shop: { select: { slug: true, name: true } },
        section: { select: { slug: true, titleRu: true } },
        category: { select: { slug: true, titleRu: true } },
      },
    });

    if (body.kind === 'shop' && body.shopId) {
      await this.prisma.marketShop.update({
        where: { id: body.shopId },
        data: { followersCount: { increment: 1 } },
      });
    }

    return toSubscriptionDto(created);
  }

  async remove(userId: string, id: string): Promise<void> {
    const subscription = await this.prisma.marketSubscription.findUnique({
      where: { id },
      select: { id: true, userId: true, kind: true, shopId: true },
    });
    if (!subscription || subscription.userId !== userId) {
      throw new NotFoundException('subscription_not_found');
    }

    await this.prisma.marketSubscription.delete({ where: { id } });
    if (subscription.kind === 'shop' && subscription.shopId) {
      await this.prisma.marketShop.update({
        where: { id: subscription.shopId },
        data: { followersCount: { decrement: 1 } },
      });
    }
  }

  /** Подписан ли зритель на цель — чтобы кнопка знала своё состояние. */
  async isSubscribed(
    userId: string,
    kind: CreateMarketSubscriptionRequest['kind'],
    targetKey: string,
  ): Promise<boolean> {
    const row = await this.prisma.marketSubscription.findUnique({
      where: { userId_kind_targetKey: { userId, kind, targetKey } },
      select: { id: true },
    });
    return Boolean(row);
  }

  /**
   * Рассылка о новом объявлении. Вызывается после публикации и никогда не
   * бросает: подписки — побочный эффект, и упавшая рассылка не должна
   * отменять публикацию, которая уже состоялась.
   */
  async notifyNewListing(listingId: string): Promise<void> {
    try {
      const listing = await this.prisma.marketListing.findUnique({
        where: { id: listingId },
        select: {
          id: true,
          titleRu: true,
          titleEn: true,
          status: true,
          shopId: true,
          shop: { select: { id: true, name: true, ownerId: true } },
          categories: {
            select: {
              category: {
                select: { id: true, titleRu: true, sectionId: true, section: { select: { titleRu: true } } },
              },
            },
          },
        },
      });
      if (!listing || listing.status !== 'published') return;

      const categoryIds = listing.categories.map((link) => link.category.id);
      const sectionIds = listing.categories.map((link) => link.category.sectionId);

      const subscriptions = await this.prisma.marketSubscription.findMany({
        where: {
          OR: [
            { kind: 'shop', shopId: listing.shopId },
            { kind: 'category', categoryId: { in: categoryIds } },
            { kind: 'section', sectionId: { in: sectionIds } },
          ],
          // Себе о своих же объявлениях не пишем.
          userId: { not: listing.shop.ownerId },
        },
        select: {
          id: true,
          userId: true,
          kind: true,
          shop: { select: { name: true } },
          section: { select: { titleRu: true } },
          category: { select: { titleRu: true } },
        },
      });

      // Один человек может быть подписан и на магазин, и на его категорию —
      // уведомление должно прийти одно.
      const seen = new Set<string>();
      const title = listing.titleRu ?? listing.titleEn ?? '';

      for (const subscription of subscriptions) {
        if (seen.has(subscription.userId)) continue;
        seen.add(subscription.userId);

        const sourceName =
          subscription.shop?.name ??
          subscription.category?.titleRu ??
          subscription.section?.titleRu ??
          listing.shop.name;

        const event = {
          name: 'market.listing.published',
          recipientId: subscription.userId,
          sourceName,
          listingTitle: title,
          listingId: listing.id,
        } satisfies NotificationEvent;
        this.events.emit(event.name, event);
      }

      if (seen.size > 0) {
        await this.prisma.marketSubscription.updateMany({
          where: { id: { in: subscriptions.map((s) => s.id) } },
          data: { lastNotifiedAt: new Date() },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Не удалось разослать уведомления о новинке ${listingId}: ${String(error)}`,
      );
    }
  }

  /**
   * Уведомление о снижении цены. Опирается на снимок `priceAtFavorite`,
   * который кладётся при добавлении в избранное: без него сравнивать не с чем.
   * После рассылки снимок обновляется, иначе одно и то же снижение будет
   * приходить при каждой правке цены.
   */
  async notifyPriceDrop(
    listingId: string,
    newPriceMinor: number | null,
  ): Promise<void> {
    try {
      if (newPriceMinor === null) return;

      const listing = await this.prisma.marketListing.findUnique({
        where: { id: listingId },
        select: {
          id: true,
          titleRu: true,
          titleEn: true,
          currency: true,
          status: true,
        },
      });
      if (!listing || listing.status !== 'published') return;

      const favorites = await this.prisma.marketFavorite.findMany({
        where: {
          listingId,
          priceAtFavorite: { gt: newPriceMinor },
          user: {
            OR: [
              { marketPreference: { is: null } },
              { marketPreference: { priceDropAlerts: true } },
            ],
          },
        },
        select: { userId: true, priceAtFavorite: true },
      });

      const title = listing.titleRu ?? listing.titleEn ?? '';
      for (const favorite of favorites) {
        const event = {
          name: 'market.listing.price-dropped',
          recipientId: favorite.userId,
          listingTitle: title,
          listingId: listing.id,
          priceMinor: newPriceMinor,
          previousPriceMinor: favorite.priceAtFavorite ?? newPriceMinor,
          currency: listing.currency,
        } satisfies NotificationEvent;
        this.events.emit(event.name, event);
      }

      if (favorites.length > 0) {
        await this.prisma.marketFavorite.updateMany({
          where: { listingId, userId: { in: favorites.map((f) => f.userId) } },
          data: { priceAtFavorite: newPriceMinor },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Не удалось разослать уведомления о снижении цены ${listingId}: ${String(error)}`,
      );
    }
  }

  private async assertTargetExists(
    body: CreateMarketSubscriptionRequest,
  ): Promise<void> {
    if (body.kind === 'shop') {
      const shop = body.shopId
        ? await this.prisma.marketShop.findUnique({
            where: { id: body.shopId },
            select: { id: true },
          })
        : null;
      if (!shop) throw new NotFoundException('shop_not_found');
      return;
    }
    if (body.kind === 'section') {
      const section = body.sectionId
        ? await this.prisma.marketSection.findUnique({
            where: { id: body.sectionId },
            select: { id: true },
          })
        : null;
      if (!section) throw new NotFoundException('section_not_found');
      return;
    }
    if (body.kind === 'category') {
      const category = body.categoryId
        ? await this.prisma.marketCategory.findUnique({
            where: { id: body.categoryId },
            select: { id: true },
          })
        : null;
      if (!category) throw new NotFoundException('category_not_found');
    }
  }
}

function toSubscriptionDto(row: {
  id: string;
  kind: MarketSubscriptionDto['kind'];
  title: string | null;
  query: Prisma.JsonValue | null;
  createdAt: Date;
  shop: { slug: string; name: string } | null;
  section: { slug: string; titleRu: string } | null;
  category: { slug: string; titleRu: string } | null;
}): MarketSubscriptionDto {
  const query = (row.query as MarketListingFilters | null) ?? null;
  return {
    id: row.id,
    kind: row.kind,
    title:
      row.title ??
      row.shop?.name ??
      row.category?.titleRu ??
      row.section?.titleRu ??
      // У безымянного сохранённого поиска показываем сам запрос: «подписка»
      // без подписи в списке неотличима от соседней.
      (query?.q ? `«${query.q}»` : 'Сохранённый поиск'),
    shopSlug: row.shop?.slug ?? null,
    sectionSlug: row.section?.slug ?? null,
    categorySlug: row.category?.slug ?? null,
    query,
    createdAt: row.createdAt.toISOString(),
  };
}

export { savedSearchKey };
