import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type {
  CreateMarketCommentRequest,
  CreateMarketReviewRequest,
  MarketCommentDto,
  MarketCommentsResponse,
  MarketReviewDto,
  MarketReviewListResponse,
  NotificationEvent,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { applyRatingDelta, isValidRating, ratingBreakdown } from './review-rating';

const MAX_REVIEW_LENGTH = 4000;
const MAX_COMMENT_LENGTH = 2000;
const REVIEWS_PAGE_SIZE = 50;
const COMMENTS_PAGE_SIZE = 100;

const REVIEW_SELECT = {
  id: true,
  orderId: true,
  shopId: true,
  listingId: true,
  rating: true,
  body: true,
  status: true,
  createdAt: true,
  authorId: true,
  author: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.MarketReviewSelect;

type ReviewRow = Prisma.MarketReviewGetPayload<{ select: typeof REVIEW_SELECT }>;

@Injectable()
export class MarketReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  /**
   * Отзыв только по завершённой заявке. Правило «один отзыв на заявку»
   * выражено уникальным индексом на orderId, здесь мы лишь превращаем
   * нарушение в понятный код ошибки.
   */
  async create(
    userId: string,
    body: CreateMarketReviewRequest,
  ): Promise<MarketReviewDto> {
    if (!isValidRating(body.rating)) {
      throw new BadRequestException('rating_invalid');
    }
    const text = body.body?.trim() || null;
    if (text && text.length > MAX_REVIEW_LENGTH) {
      throw new BadRequestException('review_too_long');
    }

    const order = await this.prisma.marketOrder.findUnique({
      where: { id: body.orderId },
      select: {
        id: true,
        buyerId: true,
        shopId: true,
        status: true,
        shop: { select: { slug: true, ownerId: true } },
        items: { select: { listingId: true }, take: 1 },
        review: { select: { id: true } },
      },
    });
    if (!order) throw new NotFoundException('order_not_found');
    if (order.buyerId !== userId) {
      throw new ForbiddenException('not_order_participant');
    }
    // Оценивать можно только состоявшуюся сделку: иначе рейтинг превращается
    // в оружие против продавца, который ещё ничего не сделал.
    if (order.status !== 'completed') {
      throw new BadRequestException('order_not_completed');
    }
    if (order.review) throw new ConflictException('review_already_exists');

    const created = await this.prisma.$transaction(async (tx) => {
      const review = await tx.marketReview.create({
        data: {
          orderId: order.id,
          shopId: order.shopId,
          listingId: order.items[0]?.listingId ?? null,
          authorId: userId,
          rating: body.rating,
          body: text,
        },
        select: REVIEW_SELECT,
      });

      const shop = await tx.marketShop.findUniqueOrThrow({
        where: { id: order.shopId },
        select: { ratingSum: true, reviewsCount: true },
      });
      await tx.marketShop.update({
        where: { id: order.shopId },
        data: applyRatingDelta(shop, { ratingSum: body.rating, reviewsCount: 1 }),
      });

      return review;
    });

    const author = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const event = {
      name: 'market.review.received',
      recipientId: order.shop.ownerId,
      authorName: author?.name ?? '',
      rating: body.rating,
      shopSlug: order.shop.slug,
    } satisfies NotificationEvent;
    this.events.emit(event.name, event);

    return toReviewDto(created, userId, false);
  }

  async listByShop(
    shopSlug: string,
    viewerId: string | undefined,
    viewerIsAdmin: boolean,
  ): Promise<MarketReviewListResponse> {
    const shop = await this.prisma.marketShop.findUnique({
      where: { slug: shopSlug },
      select: { id: true, ratingAvg: true },
    });
    if (!shop) throw new NotFoundException('shop_not_found');

    const where: Prisma.MarketReviewWhereInput = {
      shopId: shop.id,
      status: 'published',
    };

    const [rows, total, all] = await Promise.all([
      this.prisma.marketReview.findMany({
        where,
        select: REVIEW_SELECT,
        orderBy: { createdAt: 'desc' },
        take: REVIEWS_PAGE_SIZE,
      }),
      this.prisma.marketReview.count({ where }),
      this.prisma.marketReview.findMany({ where, select: { rating: true } }),
    ]);

    return {
      items: rows.map((row) => toReviewDto(row, viewerId, viewerIsAdmin)),
      total,
      ratingAvg: shop.ratingAvg,
      breakdown: ratingBreakdown(all.map((row) => row.rating)),
    };
  }

  /** Отзыв по конкретной заявке — чтобы страница заявки знала, оставлен ли он. */
  async byOrder(orderId: string, viewerId: string): Promise<MarketReviewDto | null> {
    const review = await this.prisma.marketReview.findUnique({
      where: { orderId },
      select: REVIEW_SELECT,
    });
    return review ? toReviewDto(review, viewerId, false) : null;
  }

  /**
   * Удаление отзыва. Строку оставляем со статусом, а не стираем: иначе
   * `@unique` на orderId освободится и по той же сделке можно будет написать
   * второй отзыв, обойдя правило.
   */
  async remove(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
  ): Promise<void> {
    const review = await this.prisma.marketReview.findUnique({
      where: { id },
      select: { id: true, authorId: true, shopId: true, rating: true, status: true },
    });
    if (!review) throw new NotFoundException('review_not_found');
    if (review.authorId !== userId && !viewerIsAdmin) {
      throw new ForbiddenException('not_review_author');
    }
    if (review.status !== 'published') return;

    await this.prisma.$transaction(async (tx) => {
      await tx.marketReview.update({
        where: { id },
        data: {
          status: viewerIsAdmin && review.authorId !== userId
            ? 'removed_by_admin'
            : 'removed_by_author',
        },
      });
      const shop = await tx.marketShop.findUniqueOrThrow({
        where: { id: review.shopId },
        select: { ratingSum: true, reviewsCount: true },
      });
      await tx.marketShop.update({
        where: { id: review.shopId },
        data: applyRatingDelta(shop, {
          ratingSum: -review.rating,
          reviewsCount: -1,
        }),
      });
    });
  }

  // ===== Комментарии под объявлением =====

  async listComments(
    listingId: string,
    viewerId: string | undefined,
    viewerIsAdmin: boolean,
  ): Promise<MarketCommentsResponse> {
    const where: Prisma.MarketListingCommentWhereInput = {
      listingId,
      status: 'published',
    };
    const [rows, total] = await Promise.all([
      this.prisma.marketListingComment.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: COMMENTS_PAGE_SIZE,
        select: {
          id: true,
          listingId: true,
          body: true,
          status: true,
          createdAt: true,
          userId: true,
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      }),
      this.prisma.marketListingComment.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        listingId: row.listingId,
        body: row.body,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        author: row.user
          ? { id: row.user.id, name: row.user.name, avatarUrl: row.user.avatarUrl }
          : null,
        canDelete: Boolean(
          viewerIsAdmin || (viewerId && row.userId === viewerId),
        ),
      })),
      total,
    };
  }

  async addComment(
    userId: string,
    listingId: string,
    body: CreateMarketCommentRequest,
  ): Promise<MarketCommentDto> {
    const text = body.body?.trim() ?? '';
    if (!text) throw new BadRequestException('comment_required');
    if (text.length > MAX_COMMENT_LENGTH) {
      throw new BadRequestException('comment_too_long');
    }

    const listing = await this.prisma.marketListing.findUnique({
      where: { id: listingId },
      select: { id: true, status: true, shop: { select: { status: true } } },
    });
    if (
      !listing ||
      listing.status !== 'published' ||
      listing.shop.status !== 'active'
    ) {
      throw new NotFoundException('listing_not_found');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const comment = await tx.marketListingComment.create({
        data: { listingId, userId, body: text },
        select: {
          id: true,
          listingId: true,
          body: true,
          status: true,
          createdAt: true,
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
      });
      await tx.marketListing.update({
        where: { id: listingId },
        data: { commentsCount: { increment: 1 } },
      });
      return comment;
    });

    return {
      id: created.id,
      listingId: created.listingId,
      body: created.body,
      status: created.status,
      createdAt: created.createdAt.toISOString(),
      author: created.user
        ? {
            id: created.user.id,
            name: created.user.name,
            avatarUrl: created.user.avatarUrl,
          }
        : null,
      canDelete: true,
    };
  }

  async removeComment(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
  ): Promise<void> {
    const comment = await this.prisma.marketListingComment.findUnique({
      where: { id },
      select: { id: true, userId: true, listingId: true, status: true },
    });
    if (!comment) throw new NotFoundException('comment_not_found');
    if (comment.userId !== userId && !viewerIsAdmin) {
      throw new ForbiddenException('not_comment_author');
    }
    if (comment.status !== 'published') return;

    await this.prisma.$transaction(async (tx) => {
      await tx.marketListingComment.update({
        where: { id },
        data: {
          status:
            viewerIsAdmin && comment.userId !== userId
              ? 'removed_by_admin'
              : 'removed_by_author',
        },
      });
      await tx.marketListing.update({
        where: { id: comment.listingId },
        data: { commentsCount: { decrement: 1 } },
      });
    });
  }
}

function toReviewDto(
  row: ReviewRow,
  viewerId: string | undefined,
  viewerIsAdmin: boolean,
): MarketReviewDto {
  return {
    id: row.id,
    orderId: row.orderId,
    shopId: row.shopId,
    listingId: row.listingId,
    rating: row.rating,
    body: row.body,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    author: row.author
      ? { id: row.author.id, name: row.author.name, avatarUrl: row.author.avatarUrl }
      : null,
    canDelete: Boolean(viewerIsAdmin || (viewerId && row.authorId === viewerId)),
  };
}
