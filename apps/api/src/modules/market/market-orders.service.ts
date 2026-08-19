import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  MarketOrderDto,
  MarketOrderListResponse,
  NotificationEvent,
  UpdateMarketOrderStatusRequest,
} from '@vedamatch/shared';
import { resolveDisplayName } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MARKET_ORDER_STATUSES,
  assertOneOf,
  parseOptionalEnum,
} from './market-enums';
import {
  availableTransitions,
  canTransition,
  transitionTimestamps,
  type OrderActor,
} from './order-transitions';

const PAGE_SIZE = 20;
const MAX_REASON_LENGTH = 500;

const ORDER_SELECT = {
  id: true,
  number: true,
  status: true,
  totalMinor: true,
  currency: true,
  deliveryOption: true,
  deliveryNote: true,
  buyerComment: true,
  declineReason: true,
  createdAt: true,
  acceptedAt: true,
  completedAt: true,
  closedAt: true,
  buyerId: true,
  buyer: { select: { id: true, name: true, spiritualName: true } },
  shop: {
    select: { id: true, slug: true, name: true, logoUrl: true, ownerId: true },
  },
  items: {
    select: {
      id: true,
      listingId: true,
      titleSnapshot: true,
      priceMinor: true,
      currency: true,
      imageUrl: true,
      quantity: true,
      lineTotalMinor: true,
    },
  },
  conversations: { select: { id: true }, take: 1 },
} satisfies Prisma.MarketOrderSelect;

type OrderRow = Prisma.MarketOrderGetPayload<{ select: typeof ORDER_SELECT }>;

@Injectable()
export class MarketOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async list(
    userId: string,
    params: { role?: string; status?: string; cursor?: string },
  ): Promise<MarketOrderListResponse> {
    const role: OrderActor = params.role === 'seller' ? 'seller' : 'buyer';

    const where: Prisma.MarketOrderWhereInput =
      role === 'seller' ? { shop: { ownerId: userId } } : { buyerId: userId };

    // Фильтр из query: мусор вместо статуса — 400, а не 500 из Prisma.
    const status = parseOptionalEnum(
      MARKET_ORDER_STATUSES,
      params.status,
      'invalid_status',
    );
    if (status) where.status = status;

    const cursor = decodeCursor(params.cursor);
    if (cursor) {
      where.AND = [
        {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.marketOrder.findMany({
        where,
        select: ORDER_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PAGE_SIZE + 1,
      }),
      this.prisma.marketOrder.count({ where }),
    ]);

    const hasMore = rows.length > PAGE_SIZE;
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const last = items[items.length - 1];

    return {
      items: items.map((row) => toOrderDto(row, userId)),
      nextCursor: hasMore && last ? encodeCursor(last) : null,
      total,
    };
  }

  async byId(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
  ): Promise<MarketOrderDto> {
    const order = await this.prisma.marketOrder.findUnique({
      where: { id },
      select: ORDER_SELECT,
    });
    if (!order) throw new NotFoundException('order_not_found');

    const isBuyer = order.buyerId === userId;
    const isSeller = order.shop.ownerId === userId;
    if (!isBuyer && !isSeller && !viewerIsAdmin) {
      throw new ForbiddenException('not_order_participant');
    }
    return toOrderDto(order, userId);
  }

  async setStatus(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateMarketOrderStatusRequest,
  ): Promise<MarketOrderDto> {
    const order = await this.prisma.marketOrder.findUnique({
      where: { id },
      select: ORDER_SELECT,
    });
    if (!order) throw new NotFoundException('order_not_found');

    const isBuyer = order.buyerId === userId;
    const isSeller = order.shop.ownerId === userId;
    if (!isBuyer && !isSeller)
      throw new ForbiddenException('not_order_participant');

    const actor: OrderActor = isSeller ? 'seller' : 'buyer';
    assertOneOf(MARKET_ORDER_STATUSES, body.status, 'invalid_status');
    if (!canTransition(order.status, body.status, actor)) {
      throw new BadRequestException('invalid_order_transition');
    }

    const reason = body.reason?.trim() || null;
    if (reason && reason.length > MAX_REASON_LENGTH) {
      throw new BadRequestException('reason_too_long');
    }

    const now = new Date();
    const closing =
      body.status === 'declined_by_seller' ||
      body.status === 'cancelled_by_buyer';

    await this.prisma.$transaction(async (tx) => {
      // Переход только из того статуса, который мы проверили: иначе
      // одновременные «продавец отклонил» и «покупатель отменил» оба
      // прошли бы и вернули остаток дважды.
      const updated = await tx.marketOrder.updateMany({
        where: { id, status: order.status },
        data: {
          status: body.status,
          declineReason: closing ? reason : order.declineReason,
          ...transitionTimestamps(body.status, now),
        },
      });
      if (updated.count === 0) {
        throw new BadRequestException('invalid_order_transition');
      }

      // Отказ и отмена возвращают отслеживаемый остаток: товар так и не ушёл,
      // и держать его списанным — значит потерять его из выдачи навсегда.
      if (closing) {
        for (const item of order.items) {
          if (!item.listingId) continue;
          const listing = await tx.marketListing.findUnique({
            where: { id: item.listingId },
            select: { trackStock: true },
          });
          if (listing?.trackStock) {
            await tx.marketListing.update({
              where: { id: item.listingId },
              data: { quantity: { increment: item.quantity } },
            });
          }
        }
      }
    });

    // Уведомляем вторую сторону: тот, кто нажал кнопку, и так всё видит.
    const recipientId = isSeller ? order.buyerId : order.shop.ownerId;
    const event = {
      name: 'market.order.status-changed',
      recipientId,
      shopName: order.shop.name,
      orderId: order.id,
      orderNumber: order.number,
      status: body.status,
    } satisfies NotificationEvent;
    this.events.emit(event.name, event);

    return this.byId(userId, viewerIsAdmin, id);
  }

  /** Заявка, по которой зритель уже может оставить отзыв (фаза 3 опирается
   *  на этот же признак: завершена и зритель — покупатель). */
  async isReviewable(userId: string, orderId: string): Promise<boolean> {
    const order = await this.prisma.marketOrder.findUnique({
      where: { id: orderId },
      select: { buyerId: true, status: true },
    });
    return Boolean(
      order && order.buyerId === userId && order.status === 'completed',
    );
  }
}

function toOrderDto(row: OrderRow, viewerId: string): MarketOrderDto {
  const isSeller = row.shop.ownerId === viewerId;
  const viewerRole: OrderActor = isSeller ? 'seller' : 'buyer';

  return {
    id: row.id,
    number: row.number,
    status: row.status,
    totalMinor: row.totalMinor,
    currency: row.currency,
    deliveryOption: row.deliveryOption,
    deliveryNote: row.deliveryNote,
    buyerComment: row.buyerComment,
    declineReason: row.declineReason,
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    items: row.items.map((item) => ({
      id: item.id,
      listingId: item.listingId,
      titleSnapshot: item.titleSnapshot,
      priceMinor: item.priceMinor,
      currency: item.currency,
      imageUrl: item.imageUrl,
      quantity: item.quantity,
      lineTotalMinor: item.lineTotalMinor,
    })),
    shop: {
      id: row.shop.id,
      slug: row.shop.slug,
      name: row.shop.name,
      logoUrl: row.shop.logoUrl,
    },
    // Покупателя видит только продавец: покупателю показывать самого себя незачем.
    buyer: isSeller
      ? { id: row.buyer.id, name: resolveDisplayName(row.buyer) }
      : null,
    viewerRole,
    availableTransitions: availableTransitions(row.status, viewerRole),
    conversationId: row.conversations[0]?.id ?? null,
  };
}

function encodeCursor(order: { createdAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ c: order.createdAt.toISOString(), i: order.id }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(
  cursor: string | undefined,
): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as { c?: unknown; i?: unknown };
    if (typeof parsed.c !== 'string' || typeof parsed.i !== 'string')
      return null;
    const createdAt = new Date(parsed.c);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.i };
  } catch {
    return null;
  }
}
