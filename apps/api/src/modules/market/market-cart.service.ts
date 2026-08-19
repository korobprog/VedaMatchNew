import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  AddToMarketCartRequest,
  MarketCartDto,
  MarketCartItemDto,
  MarketCheckoutRequest,
  MarketCheckoutResponse,
  MarketDeliveryOption,
  NotificationEvent,
} from '@vedamatch/shared';
import { resolveDisplayName } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { checkCartEligibility, isAvailable } from './market-availability';
import { lineTotal, splitCart, type CartRow } from './cart-split';
import { MARKET_DELIVERY_OPTIONS, isOneOf } from './market-enums';
import { MarketOrdersService } from './market-orders.service';

/** Больше — это уже опт, а он делается перепиской, а не корзиной. */
const MAX_QUANTITY_PER_ITEM = 999;
/** Колонки totalMinor/lineTotalMinor — Int: сумма сверх этого падала бы в Prisma 500-кой. */
const MAX_ORDER_TOTAL_MINOR = 2_147_483_647;
const MAX_DELIVERY_NOTE = 500;
const MAX_COMMENT = 2000;

const CART_SELECT = {
  listingId: true,
  quantity: true,
  listing: {
    select: {
      id: true,
      titleRu: true,
      titleEn: true,
      primaryImageUrl: true,
      priceMode: true,
      priceMinor: true,
      priceMaxMinor: true,
      currency: true,
      status: true,
      trackStock: true,
      quantity: true,
      shop: {
        select: {
          id: true,
          slug: true,
          name: true,
          logoUrl: true,
          status: true,
          ownerId: true,
          deliveryOptions: true,
        },
      },
    },
  },
} satisfies Prisma.MarketCartItemSelect;

type CartItemRow = Prisma.MarketCartItemGetPayload<{
  select: typeof CART_SELECT;
}>;

@Injectable()
export class MarketCartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: MarketOrdersService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Корзина всегда перечитывает живое состояние объявлений: между добавлением
   * и просмотром цена могла измениться, а остаток кончиться. Устаревшая
   * корзина — норма, а не исключение, поэтому недоступные позиции не
   * выбрасываются молча, а показываются отдельным списком.
   */
  async get(userId: string): Promise<MarketCartDto> {
    const rows = await this.prisma.marketCartItem.findMany({
      where: { userId },
      select: CART_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    const { groups, unavailable } = splitCart(rows.map(toCartRow));
    const byListingId = new Map(rows.map((row) => [row.listingId, row]));

    return {
      groups: groups.map((group) => {
        const first = byListingId.get(group.rows[0].listingId)!;
        const shop = first.listing.shop;
        return {
          shopId: shop.id,
          shopSlug: shop.slug,
          shopName: shop.name,
          shopLogoUrl: shop.logoUrl,
          currency: group.currency,
          items: group.rows.map((row) =>
            toCartItemDto(byListingId.get(row.listingId)!),
          ),
          subtotalMinor: group.subtotalMinor,
          deliveryOptions: shop.deliveryOptions,
        };
      }),
      unavailable: unavailable.map((row) =>
        toCartItemDto(byListingId.get(row.listingId)!),
      ),
      itemsCount: rows.length,
    };
  }

  /** Питает бейдж в шапке — считаем позиции, а не штуки: «3» на значке
   *  означает «три товара», а не «три килограмма риса». */
  async count(userId: string): Promise<number> {
    return this.prisma.marketCartItem.count({ where: { userId } });
  }

  async add(
    userId: string,
    body: AddToMarketCartRequest,
  ): Promise<MarketCartDto> {
    const listing = await this.loadListing(body.listingId);
    if (listing.shop.ownerId === userId) {
      throw new BadRequestException('cannot_order_own_listing');
    }

    const requested = normalizeQuantity(listing.kind, body.quantity ?? 1);
    const existing = await this.prisma.marketCartItem.findUnique({
      where: { userId_listingId: { userId, listingId: listing.id } },
      select: { quantity: true },
    });
    // Повторное добавление увеличивает количество, а не сбрасывает его:
    // так ведут себя все корзины, и обратное поведение выглядит как потеря.
    const quantity = normalizeQuantity(
      listing.kind,
      (existing?.quantity ?? 0) + requested,
    );

    const rejection = checkCartEligibility({
      status: listing.status,
      trackStock: listing.trackStock,
      quantity: listing.quantity,
      shopStatus: listing.shop.status,
      requestedQuantity: quantity,
    });
    if (rejection) throw new BadRequestException(rejection);

    await this.prisma.marketCartItem.upsert({
      where: { userId_listingId: { userId, listingId: listing.id } },
      update: { quantity },
      create: { userId, listingId: listing.id, quantity },
    });

    return this.get(userId);
  }

  async updateQuantity(
    userId: string,
    listingId: string,
    quantity: number,
  ): Promise<MarketCartDto> {
    const existing = await this.prisma.marketCartItem.findUnique({
      where: { userId_listingId: { userId, listingId } },
      select: { listingId: true },
    });
    if (!existing) throw new NotFoundException('cart_item_not_found');

    const listing = await this.loadListing(listingId);
    const next = normalizeQuantity(listing.kind, quantity);

    const rejection = checkCartEligibility({
      status: listing.status,
      trackStock: listing.trackStock,
      quantity: listing.quantity,
      shopStatus: listing.shop.status,
      requestedQuantity: next,
    });
    if (rejection) throw new BadRequestException(rejection);

    await this.prisma.marketCartItem.update({
      where: { userId_listingId: { userId, listingId } },
      data: { quantity: next },
    });
    return this.get(userId);
  }

  async remove(userId: string, listingId: string): Promise<MarketCartDto> {
    await this.prisma.marketCartItem.deleteMany({
      where: { userId, listingId },
    });
    return this.get(userId);
  }

  async clear(userId: string): Promise<void> {
    await this.prisma.marketCartItem.deleteMany({ where: { userId } });
  }

  /**
   * Оформление. Всё внутри одной транзакции и с перепроверкой доступности:
   * между открытием корзины и нажатием кнопки остаток мог кончиться, а цена
   * измениться. При расхождении падаем громко — молча оформить заявку по
   * старой цене хуже, чем попросить человека взглянуть на корзину заново.
   */
  async checkout(
    userId: string,
    body: MarketCheckoutRequest,
  ): Promise<MarketCheckoutResponse> {
    const requested = body.groups ?? [];
    if (requested.length === 0) throw new BadRequestException('cart_empty');

    for (const group of requested) {
      if ((group.deliveryNote?.length ?? 0) > MAX_DELIVERY_NOTE) {
        throw new BadRequestException('delivery_note_too_long');
      }
      if ((group.comment?.length ?? 0) > MAX_COMMENT) {
        throw new BadRequestException('comment_too_long');
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.marketCartItem.findMany({
        where: { userId },
        select: CART_SELECT,
      });
      if (rows.length === 0) throw new BadRequestException('cart_empty');

      const byListingId = new Map(rows.map((row) => [row.listingId, row]));
      const { groups } = splitCart(rows.map(toCartRow));
      const orderIds: string[] = [];

      for (const wanted of requested) {
        const group = groups.find(
          (candidate) =>
            candidate.shopId === wanted.shopId &&
            candidate.currency === wanted.currency,
        );
        // Группы нет — значит все её позиции стали недоступны, пока человек
        // заполнял форму. Это ровно тот случай, ради которого нужна проверка.
        if (!group) throw new BadRequestException('cart_items_unavailable');
        if (group.subtotalMinor > MAX_ORDER_TOTAL_MINOR) {
          throw new BadRequestException('order_total_too_large');
        }

        // Способ доставки — из enum и из тех, что магазин реально предлагает:
        // иначе продавцу приезжала бы заявка «курьером» от магазина, который
        // работает только на самовывоз, а мусор вместо enum ронял бы Prisma 500-кой.
        const shopDeliveryOptions = byListingId.get(group.rows[0].listingId)!
          .listing.shop.deliveryOptions;
        const deliveryOption = resolveDeliveryOption(
          wanted.deliveryOption,
          shopDeliveryOptions,
        );

        for (const row of group.rows) {
          const item = byListingId.get(row.listingId)!;
          const rejection = checkCartEligibility({
            status: item.listing.status,
            trackStock: item.listing.trackStock,
            quantity: item.listing.quantity,
            shopStatus: item.listing.shop.status,
            requestedQuantity: item.quantity,
          });
          if (rejection)
            throw new BadRequestException('cart_items_unavailable');
        }

        const order = await tx.marketOrder.create({
          data: {
            buyerId: userId,
            shopId: group.shopId,
            currency: group.currency,
            totalMinor: group.subtotalMinor,
            deliveryOption,
            deliveryNote: wanted.deliveryNote?.trim() || null,
            buyerComment: wanted.comment?.trim() || null,
            items: {
              create: group.rows.map((row) => {
                const item = byListingId.get(row.listingId)!;
                return {
                  listingId: item.listingId,
                  // Снимок: объявление могут отредактировать или удалить,
                  // а заявка обязана остаться читаемой.
                  titleSnapshot:
                    item.listing.titleRu ?? item.listing.titleEn ?? '',
                  priceMinor: item.listing.priceMinor ?? 0,
                  currency: item.listing.currency,
                  imageUrl: item.listing.primaryImageUrl,
                  quantity: item.quantity,
                  lineTotalMinor: lineTotal({
                    priceMinor: item.listing.priceMinor,
                    quantity: item.quantity,
                  }),
                };
              }),
            },
          },
          select: { id: true },
        });
        orderIds.push(order.id);

        for (const row of group.rows) {
          const item = byListingId.get(row.listingId)!;
          if (item.listing.trackStock) {
            // Списание с условием по остатку: проверка выше сделана по данным,
            // прочитанным в начале транзакции, и две параллельные покупки
            // последней единицы иначе обе прошли бы и увели остаток в минус.
            const stock = await tx.marketListing.updateMany({
              where: {
                id: item.listingId,
                trackStock: true,
                quantity: { gte: item.quantity },
              },
              data: { quantity: { decrement: item.quantity } },
            });
            if (stock.count === 0) {
              throw new BadRequestException('cart_items_unavailable');
            }
          }
          await tx.marketListing.update({
            where: { id: item.listingId },
            data: { ordersCount: { increment: 1 } },
          });
        }
        await tx.marketShop.update({
          where: { id: group.shopId },
          data: { ordersCount: { increment: 1 } },
        });

        // Из корзины уходят только оформленные позиции: остальные группы
        // человек мог намеренно оставить на потом.
        await tx.marketCartItem.deleteMany({
          where: {
            userId,
            listingId: { in: group.rows.map((r) => r.listingId) },
          },
        });
      }

      return orderIds;
    });

    const orders = await Promise.all(
      created.map((id) => this.orders.byId(userId, false, id)),
    );

    for (const order of orders) {
      const shop = await this.prisma.marketShop.findUnique({
        where: { id: order.shop.id },
        select: { ownerId: true },
      });
      const buyer = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, spiritualName: true },
      });
      if (!shop) continue;
      // Имя события берём из самого события: импортировать карту имён из
      // модуля уведомлений запрещено контрактом изоляции.
      const event = {
        name: 'market.order.created',
        recipientId: shop.ownerId,
        buyerName: buyer ? resolveDisplayName(buyer) : '',
        orderId: order.id,
        orderNumber: order.number,
        itemsCount: order.items.length,
      } satisfies NotificationEvent;
      this.events.emit(event.name, event);
    }

    return { orders };
  }

  private async loadListing(listingId: string) {
    const listing = await this.prisma.marketListing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        kind: true,
        status: true,
        trackStock: true,
        quantity: true,
        shop: { select: { status: true, ownerId: true } },
      },
    });
    if (!listing) throw new NotFoundException('listing_not_found');
    return listing;
  }
}

/** У услуги количество бессмысленно — она не кончается и не делится. */
function normalizeQuantity(
  kind: 'product' | 'service',
  requested: number,
): number {
  if (kind === 'service') return 1;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new BadRequestException('quantity_invalid');
  }
  return Math.min(requested, MAX_QUANTITY_PER_ITEM);
}

function toCartRow(row: CartItemRow): CartRow {
  return {
    listingId: row.listingId,
    quantity: row.quantity,
    shopId: row.listing.shop.id,
    currency: row.listing.currency,
    priceMinor: row.listing.priceMinor,
    available: isAvailable({
      status: row.listing.status,
      trackStock: row.listing.trackStock,
      quantity: row.listing.quantity,
      shopStatus: row.listing.shop.status,
    }),
  };
}

function toCartItemDto(row: CartItemRow): MarketCartItemDto {
  const available = isAvailable({
    status: row.listing.status,
    trackStock: row.listing.trackStock,
    quantity: row.listing.quantity,
    shopStatus: row.listing.shop.status,
  });
  return {
    listingId: row.listingId,
    titleRu: row.listing.titleRu,
    titleEn: row.listing.titleEn,
    primaryImageUrl: row.listing.primaryImageUrl,
    price: {
      mode: row.listing.priceMode,
      minor: row.listing.priceMinor,
      maxMinor: row.listing.priceMaxMinor,
      currency: row.listing.currency,
    },
    quantity: row.quantity,
    lineTotalMinor:
      row.listing.priceMinor === null
        ? null
        : lineTotal({
            priceMinor: row.listing.priceMinor,
            quantity: row.quantity,
          }),
    available,
    quantityAvailable: row.listing.trackStock ? row.listing.quantity : null,
  };
}

/** Способ доставки не обязателен (услуги, самовывоз «по договорённости»),
 *  но если указан — только из enum и только из предложенных магазином. */
function resolveDeliveryOption(
  wanted: unknown,
  shopOptions: readonly MarketDeliveryOption[],
): MarketDeliveryOption | null {
  if (wanted === undefined || wanted === null || wanted === '') return null;
  if (!isOneOf(MARKET_DELIVERY_OPTIONS, wanted)) {
    throw new BadRequestException('delivery_option_unavailable');
  }
  if (!shopOptions.includes(wanted)) {
    throw new BadRequestException('delivery_option_unavailable');
  }
  return wanted;
}
