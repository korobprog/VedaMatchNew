import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AdminMarketReportDto,
  AdminMarketReportListResponse,
  CreateMarketReportRequest,
  MarketReportTargetKind,
  ResolveMarketReportRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MARKET_REPORT_STATUSES,
  assertOneOf,
  parseOptionalEnum,
} from './market-enums';
import { crossesHideThreshold, reportTargetKey } from './report-threshold';

const MAX_NOTE_LENGTH = 1000;
const PAGE_SIZE = 50;

@Injectable()
export class MarketReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Жалоба. Один человек жалуется на объект один раз — это выражено
   * `@@unique([reporterId, targetKey])`, здесь мы превращаем нарушение
   * в понятный код.
   *
   * Порог автоскрытия проверяем внутри той же транзакции, что и инкремент
   * счётчика: иначе две одновременные жалобы могут обе «не заметить» порог.
   */
  async create(userId: string, body: CreateMarketReportRequest): Promise<void> {
    const note = body.note?.trim() || null;
    if (note && note.length > MAX_NOTE_LENGTH) {
      throw new BadRequestException('note_too_long');
    }

    const target = await this.loadTarget(body.targetKind, body.targetId);
    if (target.ownerId === userId) {
      throw new BadRequestException('cannot_report_own_content');
    }

    const targetKey = reportTargetKey(body.targetKind, body.targetId);
    const existing = await this.prisma.marketReport.findUnique({
      where: { reporterId_targetKey: { reporterId: userId, targetKey } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('report_already_sent');

    await this.prisma.$transaction(async (tx) => {
      await tx.marketReport.create({
        data: {
          reporterId: userId,
          targetKind: body.targetKind,
          targetKey,
          listingId: body.targetKind === 'listing' ? body.targetId : null,
          shopId: body.targetKind === 'shop' ? body.targetId : null,
          commentId: body.targetKind === 'comment' ? body.targetId : null,
          reviewId: body.targetKind === 'review' ? body.targetId : null,
          reason: body.reason,
          note,
        },
      });

      const openReportsCount = target.openReportsCount + 1;
      const hide = crossesHideThreshold(openReportsCount);

      switch (body.targetKind) {
        case 'listing':
          await tx.marketListing.update({
            where: { id: body.targetId },
            data: {
              openReportsCount,
              needsReview: true,
              ...(hide ? { status: 'hidden_by_reports' as const } : {}),
            },
          });
          // Скрытое объявление уходит из каталога — счётчики должны это
          // отразить, иначе в разделе будет висеть несуществующая позиция.
          if (hide) await this.decrementCounters(tx, body.targetId);
          break;
        case 'shop':
          await tx.marketShop.update({
            where: { id: body.targetId },
            data: {
              openReportsCount,
              ...(hide ? { status: 'hidden_by_reports' as const } : {}),
            },
          });
          break;
        case 'comment':
          await tx.marketListingComment.update({
            where: { id: body.targetId },
            data: {
              openReportsCount,
              ...(hide ? { status: 'removed_by_admin' as const } : {}),
            },
          });
          break;
        case 'review':
          await tx.marketReview.update({
            where: { id: body.targetId },
            data: {
              openReportsCount,
              ...(hide ? { status: 'removed_by_admin' as const } : {}),
            },
          });
          break;
      }
    });
  }

  async listForAdmin(
    viewerIsAdmin: boolean,
    status: string | undefined,
  ): Promise<AdminMarketReportListResponse> {
    if (!viewerIsAdmin) throw new ForbiddenException('not_admin');

    const where: Prisma.MarketReportWhereInput = {
      status:
        parseOptionalEnum(MARKET_REPORT_STATUSES, status, 'invalid_status') ??
        'open',
    };

    const [rows, total] = await Promise.all([
      this.prisma.marketReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: PAGE_SIZE,
        include: {
          reporter: { select: { id: true, name: true } },
          listing: {
            select: {
              titleRu: true,
              titleEn: true,
              status: true,
              openReportsCount: true,
            },
          },
          shop: {
            select: { name: true, status: true, openReportsCount: true },
          },
          comment: {
            select: { body: true, status: true, openReportsCount: true },
          },
          review: {
            select: {
              body: true,
              rating: true,
              status: true,
              openReportsCount: true,
            },
          },
        },
      }),
      this.prisma.marketReport.count({ where }),
    ]);

    return { items: rows.map(toAdminReportDto), total };
  }

  /**
   * Разбор жалобы. Обнуляем счётчик открытых жалоб у цели: он существует
   * ради порога автоскрытия, и после разбора отсчёт должен начаться заново —
   * иначе одна старая жалоба вечно держала бы объект на грани.
   */
  async resolve(
    viewerIsAdmin: boolean,
    adminId: string,
    id: string,
    body: ResolveMarketReportRequest,
  ): Promise<void> {
    if (!viewerIsAdmin) throw new ForbiddenException('not_admin');
    // Разбор закрывает жалобу; вернуть её в `open` этим методом нельзя.
    const resolution = assertOneOf(
      ['reviewed', 'dismissed'] as const,
      body.status,
      'invalid_status',
    );

    const report = await this.prisma.marketReport.findUnique({
      where: { id },
      select: {
        id: true,
        targetKind: true,
        targetKey: true,
        listingId: true,
        shopId: true,
        commentId: true,
        reviewId: true,
        status: true,
      },
    });
    if (!report) throw new NotFoundException('report_not_found');

    const targetId =
      report.listingId ?? report.shopId ?? report.commentId ?? report.reviewId;
    if (!targetId) throw new NotFoundException('report_target_missing');

    await this.prisma.$transaction(async (tx) => {
      // Закрываем все открытые жалобы на ту же цель: админ разобрал ситуацию
      // целиком, а не одно обращение из трёх.
      await tx.marketReport.updateMany({
        where: { targetKey: report.targetKey, status: 'open' },
        data: {
          status: resolution,
          reviewedById: adminId,
          reviewedAt: new Date(),
          moderatorNote: body.moderatorNote?.trim() || null,
        },
      });

      const hide = body.hideTarget === true;
      switch (report.targetKind) {
        case 'listing': {
          const listing = await tx.marketListing.findUnique({
            where: { id: targetId },
            select: { status: true },
          });
          await tx.marketListing.update({
            where: { id: targetId },
            data: {
              openReportsCount: 0,
              needsReview: false,
              ...(hide
                ? { status: 'removed_by_admin' as const }
                : listing?.status === 'hidden_by_reports'
                  ? { status: 'published' as const }
                  : {}),
            },
          });
          if (hide && listing?.status === 'published') {
            await this.decrementCounters(tx, targetId);
          }
          if (!hide && listing?.status === 'hidden_by_reports') {
            await this.incrementCounters(tx, targetId);
          }
          break;
        }
        // Ниже — то же правило, что и для объявления: «не скрывать» означает
        // снять только модераторское скрытие. Магазин, закрытый владельцем, и
        // отзыв/комментарий, удалённый автором (рейтинг по нему уже списан),
        // разбором жалобы воскресать не должны.
        case 'shop': {
          const shop = await tx.marketShop.findUnique({
            where: { id: targetId },
            select: { status: true },
          });
          await tx.marketShop.update({
            where: { id: targetId },
            data: {
              openReportsCount: 0,
              ...(hide
                ? { status: 'blocked_by_admin' as const }
                : shop?.status === 'hidden_by_reports' ||
                    shop?.status === 'blocked_by_admin'
                  ? { status: 'active' as const }
                  : {}),
            },
          });
          break;
        }
        case 'comment': {
          const comment = await tx.marketListingComment.findUnique({
            where: { id: targetId },
            select: { status: true },
          });
          await tx.marketListingComment.update({
            where: { id: targetId },
            data: {
              openReportsCount: 0,
              ...(hide
                ? { status: 'removed_by_admin' as const }
                : comment?.status === 'removed_by_admin'
                  ? { status: 'published' as const }
                  : {}),
            },
          });
          break;
        }
        case 'review': {
          const review = await tx.marketReview.findUnique({
            where: { id: targetId },
            select: { status: true },
          });
          await tx.marketReview.update({
            where: { id: targetId },
            data: {
              openReportsCount: 0,
              ...(hide
                ? { status: 'removed_by_admin' as const }
                : review?.status === 'removed_by_admin'
                  ? { status: 'published' as const }
                  : {}),
            },
          });
          break;
        }
      }
    });
  }

  private async loadTarget(
    kind: MarketReportTargetKind,
    id: string,
  ): Promise<{ ownerId: string | null; openReportsCount: number }> {
    switch (kind) {
      case 'listing': {
        const listing = await this.prisma.marketListing.findUnique({
          where: { id },
          select: {
            openReportsCount: true,
            shop: { select: { ownerId: true } },
          },
        });
        if (!listing) throw new NotFoundException('listing_not_found');
        return {
          ownerId: listing.shop.ownerId,
          openReportsCount: listing.openReportsCount,
        };
      }
      case 'shop': {
        const shop = await this.prisma.marketShop.findUnique({
          where: { id },
          select: { openReportsCount: true, ownerId: true },
        });
        if (!shop) throw new NotFoundException('shop_not_found');
        return {
          ownerId: shop.ownerId,
          openReportsCount: shop.openReportsCount,
        };
      }
      case 'comment': {
        const comment = await this.prisma.marketListingComment.findUnique({
          where: { id },
          select: { openReportsCount: true, userId: true },
        });
        if (!comment) throw new NotFoundException('comment_not_found');
        return {
          ownerId: comment.userId,
          openReportsCount: comment.openReportsCount,
        };
      }
      case 'review': {
        const review = await this.prisma.marketReview.findUnique({
          where: { id },
          select: { openReportsCount: true, authorId: true },
        });
        if (!review) throw new NotFoundException('review_not_found');
        return {
          ownerId: review.authorId,
          openReportsCount: review.openReportsCount,
        };
      }
    }
  }

  private async decrementCounters(
    tx: Prisma.TransactionClient,
    listingId: string,
  ): Promise<void> {
    await this.bumpCounters(tx, listingId, -1);
  }

  private async incrementCounters(
    tx: Prisma.TransactionClient,
    listingId: string,
  ): Promise<void> {
    await this.bumpCounters(tx, listingId, 1);
  }

  private async bumpCounters(
    tx: Prisma.TransactionClient,
    listingId: string,
    delta: number,
  ): Promise<void> {
    const step = delta > 0 ? { increment: delta } : { decrement: -delta };
    const listing = await tx.marketListing.findUnique({
      where: { id: listingId },
      select: { shopId: true },
    });
    if (!listing) return;

    const categories = await tx.marketListingCategory.findMany({
      where: { listingId },
      select: { categoryId: true },
    });
    const shelves = await tx.marketListingShelf.findMany({
      where: { listingId },
      select: { shelfId: true },
    });

    await tx.marketShop.update({
      where: { id: listing.shopId },
      data: { listingsCount: step },
    });
    if (categories.length > 0) {
      await tx.marketCategory.updateMany({
        where: { id: { in: categories.map((c) => c.categoryId) } },
        data: { listingsCount: step },
      });
    }
    if (shelves.length > 0) {
      await tx.marketShelf.updateMany({
        where: { id: { in: shelves.map((s) => s.shelfId) } },
        data: { listingsCount: step },
      });
    }
  }
}

function toAdminReportDto(row: {
  id: string;
  targetKind: MarketReportTargetKind;
  listingId: string | null;
  shopId: string | null;
  commentId: string | null;
  reviewId: string | null;
  reason: AdminMarketReportDto['reason'];
  note: string | null;
  status: AdminMarketReportDto['status'];
  createdAt: Date;
  reporter: { id: string; name: string } | null;
  listing: {
    titleRu: string | null;
    titleEn: string | null;
    status: string;
    openReportsCount: number;
  } | null;
  shop: { name: string; status: string; openReportsCount: number } | null;
  comment: { body: string; status: string; openReportsCount: number } | null;
  review: {
    body: string | null;
    rating: number;
    status: string;
    openReportsCount: number;
  } | null;
}): AdminMarketReportDto {
  const targetId =
    row.listingId ?? row.shopId ?? row.commentId ?? row.reviewId ?? '';

  const label =
    row.listing?.titleRu ??
    row.listing?.titleEn ??
    row.shop?.name ??
    excerpt(row.comment?.body) ??
    (row.review
      ? `${row.review.rating}★ ${excerpt(row.review.body) ?? ''}`.trim()
      : null) ??
    targetId;

  const status =
    row.listing?.status ??
    row.shop?.status ??
    row.comment?.status ??
    row.review?.status;

  return {
    id: row.id,
    targetKind: row.targetKind,
    targetId,
    targetLabel: label,
    reason: row.reason,
    note: row.note,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    reporter: row.reporter,
    openReportsCount:
      row.listing?.openReportsCount ??
      row.shop?.openReportsCount ??
      row.comment?.openReportsCount ??
      row.review?.openReportsCount ??
      0,
    targetHidden:
      status === 'hidden_by_reports' ||
      status === 'removed_by_admin' ||
      status === 'blocked_by_admin',
  };
}

function excerpt(body: string | null | undefined): string | null {
  if (!body) return null;
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}
