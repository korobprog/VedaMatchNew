import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  MarketChatState,
  MarketChatSummary,
  MarketChatsState,
  MarketMessageDto,
  NotificationEvent,
  SendMarketMessageRequest,
  StartMarketChatRequest,
} from '@vedamatch/shared';
import { resolveDisplayName } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { isWithinEditWindow, validateMessageBody } from './message-edit-window';

/** Переписка по сделке короткая; двести сообщений покрывают её с запасом,
 *  а бесконечная лента потребовала бы своей пагинации ради редкого случая. */
const MESSAGES_LIMIT = 200;
const PREVIEW_LENGTH = 120;

const CHAT_SELECT = {
  id: true,
  shopId: true,
  buyerId: true,
  listingId: true,
  orderId: true,
  lastMessageAt: true,
  shop: {
    select: { id: true, slug: true, name: true, logoUrl: true, ownerId: true },
  },
  buyer: {
    select: { id: true, name: true, spiritualName: true, avatarUrl: true },
  },
} satisfies Prisma.MarketConversationSelect;

type ChatRow = Prisma.MarketConversationGetPayload<{
  select: typeof CHAT_SELECT;
}>;

/**
 * Чат Рынка.
 *
 * Данные профиля собеседника читаются read-only через PrismaService —
 * `UsersService` сюда не импортируется. В union-чате это сделано иначе, и это
 * нарушение контракта сервисного модуля, а не образец.
 */
@Injectable()
export class MarketChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async list(userId: string): Promise<MarketChatsState> {
    const rows = await this.prisma.marketConversation.findMany({
      where: { OR: [{ buyerId: userId }, { shop: { ownerId: userId } }] },
      select: CHAT_SELECT,
      orderBy: [{ lastMessageAt: 'desc' }, { id: 'desc' }],
    });
    if (rows.length === 0) return { chats: [], unreadTotal: 0 };

    const ids = rows.map((row) => row.id);
    // Непрочитанное — входящие без readAt. Считаем одним groupBy, а не
    // запросом на диалог.
    const unread = await this.prisma.marketMessage.groupBy({
      by: ['conversationId'],
      where: {
        conversationId: { in: ids },
        readAt: null,
        fromUserId: { not: userId },
      },
      _count: { _all: true },
    });
    const unreadByChat = new Map(
      unread.map((row) => [row.conversationId, row._count._all]),
    );

    const lastMessages = await this.prisma.marketMessage.findMany({
      where: { conversationId: { in: ids } },
      orderBy: { createdAt: 'desc' },
      distinct: ['conversationId'],
      select: { conversationId: true, body: true },
    });
    const previewByChat = new Map(
      lastMessages.map((row) => [row.conversationId, preview(row.body)]),
    );

    const chats = rows.map((row) =>
      toChatSummary(row, userId, {
        unreadCount: unreadByChat.get(row.id) ?? 0,
        preview: previewByChat.get(row.id) ?? null,
      }),
    );

    return {
      chats,
      unreadTotal: chats.reduce((sum, chat) => sum + chat.unreadCount, 0),
    };
  }

  /** Открытие диалога помечает входящие прочитанными: список открыт — значит
   *  сообщения увидены. */
  async open(userId: string, id: string): Promise<MarketChatState> {
    const chat = await this.assertParticipant(userId, id);

    await this.prisma.marketMessage.updateMany({
      where: { conversationId: id, readAt: null, fromUserId: { not: userId } },
      data: { readAt: new Date() },
    });

    // Берём ПОСЛЕДНИЕ сообщения (desc + take), а затем разворачиваем в
    // хронологию: с `asc, take` в длинном диалоге обрезались бы новые, а не
    // старые сообщения — открывший чат не видел бы, что ему только что написали.
    const messages = (
      await this.prisma.marketMessage.findMany({
        where: { conversationId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: MESSAGES_LIMIT,
        select: {
          id: true,
          conversationId: true,
          body: true,
          createdAt: true,
          editedAt: true,
          readAt: true,
          fromUserId: true,
          fromUser: {
            select: {
              id: true,
              name: true,
              spiritualName: true,
              avatarUrl: true,
            },
          },
        },
      })
    ).reverse();

    const now = new Date();
    return {
      chat: toChatSummary(chat, userId, {
        unreadCount: 0,
        preview: messages.length
          ? preview(messages[messages.length - 1].body)
          : null,
      }),
      messages: messages.map((message) => toMessageDto(message, userId, now)),
    };
  }

  /**
   * Диалог заводится по паре «магазин + покупатель». Повторный вызов с другим
   * поводом вернёт тот же диалог: иначе у одних и тех же людей копились бы
   * параллельные переписки на каждый товар.
   */
  async start(
    userId: string,
    body: StartMarketChatRequest,
  ): Promise<MarketChatSummary> {
    const shop = await this.prisma.marketShop.findUnique({
      where: { id: body.shopId },
      select: { id: true, ownerId: true, status: true },
    });
    if (!shop) throw new NotFoundException('shop_not_found');
    if (shop.ownerId === userId) {
      throw new BadRequestException('cannot_chat_with_own_shop');
    }
    if (shop.status !== 'active')
      throw new BadRequestException('shop_not_active');

    if (await this.isBlocked(userId, shop.ownerId)) {
      throw new ForbiddenException('seller_blocked');
    }

    // Повод для диалога должен принадлежать этому магазину и этому покупателю:
    // иначе в чужой переписке можно было бы «прикрепить» произвольный товар
    // или чужой заказ и по нему выяснять, что заказано и кем.
    const listingId = await this.resolveListingId(shop.id, body.listingId);
    const orderId = await this.resolveOrderId(shop.id, userId, body.orderId);

    const existing = await this.prisma.marketConversation.findUnique({
      where: { shopId_buyerId: { shopId: shop.id, buyerId: userId } },
      select: CHAT_SELECT,
    });
    if (existing) {
      return toChatSummary(existing, userId, { unreadCount: 0, preview: null });
    }

    const created = await this.prisma.marketConversation.create({
      data: {
        shopId: shop.id,
        buyerId: userId,
        listingId,
        orderId,
      },
      select: CHAT_SELECT,
    });
    return toChatSummary(created, userId, { unreadCount: 0, preview: null });
  }

  async send(
    userId: string,
    id: string,
    body: SendMarketMessageRequest,
  ): Promise<MarketMessageDto> {
    const chat = await this.assertParticipant(userId, id);

    const invalid = validateMessageBody(body.body);
    if (invalid) throw new BadRequestException(invalid);

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.marketMessage.create({
        data: {
          conversationId: id,
          fromUserId: userId,
          body: body.body.trim(),
        },
        select: {
          id: true,
          conversationId: true,
          body: true,
          createdAt: true,
          editedAt: true,
          readAt: true,
          fromUserId: true,
          fromUser: {
            select: {
              id: true,
              name: true,
              spiritualName: true,
              avatarUrl: true,
            },
          },
        },
      });
      await tx.marketConversation.update({
        where: { id },
        data: { lastMessageAt: created.createdAt },
      });
      return created;
    });

    const recipientId =
      chat.buyerId === userId ? chat.shop.ownerId : chat.buyerId;
    const sender = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, spiritualName: true },
    });
    const event = {
      name: 'market.chat.message-sent',
      recipientId,
      senderName: sender ? resolveDisplayName(sender) : '',
      body: message.body,
      conversationId: id,
    } satisfies NotificationEvent;
    this.events.emit(event.name, event);

    // `now` берём после записи: createdAt проставляет Postgres внутри
    // транзакции, и метка, снятая до неё, оказалась бы раньше созданной строки.
    return toMessageDto(message, userId, new Date());
  }

  async edit(
    userId: string,
    chatId: string,
    messageId: string,
    body: SendMarketMessageRequest,
  ): Promise<MarketMessageDto> {
    await this.assertParticipant(userId, chatId);

    const invalid = validateMessageBody(body.body);
    if (invalid) throw new BadRequestException(invalid);

    const existing = await this.prisma.marketMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        fromUserId: true,
        createdAt: true,
      },
    });
    if (!existing || existing.conversationId !== chatId) {
      throw new NotFoundException('message_not_found');
    }
    if (existing.fromUserId !== userId) {
      throw new ForbiddenException('not_message_author');
    }

    const now = new Date();
    if (!isWithinEditWindow(existing.createdAt, now)) {
      throw new BadRequestException('message_edit_window_expired');
    }

    const updated = await this.prisma.marketMessage.update({
      where: { id: messageId },
      data: { body: body.body.trim(), editedAt: now },
      select: {
        id: true,
        conversationId: true,
        body: true,
        createdAt: true,
        editedAt: true,
        readAt: true,
        fromUserId: true,
        fromUser: {
          select: {
            id: true,
            name: true,
            spiritualName: true,
            avatarUrl: true,
          },
        },
      },
    });
    return toMessageDto(updated, userId, now);
  }

  /** Непрочитанное по всем диалогам — для бейджа. */
  async unreadTotal(userId: string): Promise<number> {
    return this.prisma.marketMessage.count({
      where: {
        readAt: null,
        fromUserId: { not: userId },
        conversation: {
          OR: [{ buyerId: userId }, { shop: { ownerId: userId } }],
        },
      },
    });
  }

  private async resolveListingId(
    shopId: string,
    listingId: string | null | undefined,
  ): Promise<string | null> {
    if (!listingId) return null;
    if (typeof listingId !== 'string') {
      throw new BadRequestException('invalid_listing_id');
    }
    const listing = await this.prisma.marketListing.findUnique({
      where: { id: listingId },
      select: { shopId: true },
    });
    if (!listing || listing.shopId !== shopId) {
      throw new NotFoundException('listing_not_found');
    }
    return listingId;
  }

  private async resolveOrderId(
    shopId: string,
    userId: string,
    orderId: string | null | undefined,
  ): Promise<string | null> {
    if (!orderId) return null;
    if (typeof orderId !== 'string') {
      throw new BadRequestException('invalid_order_id');
    }
    const order = await this.prisma.marketOrder.findUnique({
      where: { id: orderId },
      select: { shopId: true, buyerId: true },
    });
    // Чужой заказ отдаём как «не найден», чтобы не подтверждать его существование.
    if (!order || order.shopId !== shopId || order.buyerId !== userId) {
      throw new NotFoundException('order_not_found');
    }
    return orderId;
  }

  private async assertParticipant(
    userId: string,
    id: string,
  ): Promise<ChatRow> {
    const chat = await this.prisma.marketConversation.findUnique({
      where: { id },
      select: CHAT_SELECT,
    });
    if (!chat) throw new NotFoundException('conversation_not_found');
    if (chat.buyerId !== userId && chat.shop.ownerId !== userId) {
      throw new ForbiddenException('not_chat_participant');
    }
    return chat;
  }

  /** UserBlock — портальная инфраструктура модерации, читаем read-only. */
  private async isBlocked(viewerId: string, otherId: string): Promise<boolean> {
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: otherId },
          { blockerId: otherId, blockedId: viewerId },
        ],
      },
      select: { blockerId: true },
    });
    return Boolean(block);
  }
}

function toChatSummary(
  row: ChatRow,
  viewerId: string,
  extra: { unreadCount: number; preview: string | null },
): MarketChatSummary {
  const isSeller = row.shop.ownerId === viewerId;
  return {
    id: row.id,
    shop: {
      id: row.shop.id,
      slug: row.shop.slug,
      name: row.shop.name,
      logoUrl: row.shop.logoUrl,
    },
    // Покупателя показываем только продавцу — себя в списке видеть незачем.
    buyer: isSeller
      ? {
          id: row.buyer.id,
          name: resolveDisplayName(row.buyer),
          avatarUrl: row.buyer.avatarUrl,
        }
      : null,
    viewerRole: isSeller ? 'seller' : 'buyer',
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    lastMessagePreview: extra.preview,
    unreadCount: extra.unreadCount,
    listingId: row.listingId,
    orderId: row.orderId,
  };
}

function toMessageDto(
  row: {
    id: string;
    conversationId: string;
    body: string;
    createdAt: Date;
    editedAt: Date | null;
    readAt: Date | null;
    fromUserId: string;
    fromUser: { id: string; name: string; avatarUrl: string | null };
  },
  viewerId: string,
  now: Date,
): MarketMessageDto {
  const mine = row.fromUserId === viewerId;
  return {
    id: row.id,
    conversationId: row.conversationId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString() ?? null,
    readAt: row.readAt?.toISOString() ?? null,
    mine,
    author: {
      id: row.fromUser.id,
      name: resolveDisplayName(row.fromUser),
      avatarUrl: row.fromUser.avatarUrl,
    },
    canEdit: mine && isWithinEditWindow(row.createdAt, now),
  };
}

function preview(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_LENGTH
    ? `${flat.slice(0, PREVIEW_LENGTH)}…`
    : flat;
}
