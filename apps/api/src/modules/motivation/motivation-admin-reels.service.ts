import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MotivationReviewStatus } from '@prisma/client';
import {
  type AccessTokenPayload,
  type MotivationAdminReelDto,
  type MotivationAdminReelFilter,
  type MotivationAdminReelsResponse,
  type MotivationAiStatsDto,
  type MotivationAuthorPolicyDto,
  type MotivationAuthorPolicyUpdate,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { isAdmin } from './is-admin';
import {
  adminAiVerdictOf,
  adminAppealOf,
  type AuditRow,
} from './moderation-audit';
import { reelStageOf, startOfUtcDay } from './reel-stages';

const MAX_NOTE = 300;
const MAX_LIMIT = 100;

/** Статусы, в которых пост ждёт решения человека. */
const WAITING = [
  MotivationReviewStatus.text_review,
  MotivationReviewStatus.image_review,
];

/**
 * Админский срез пользовательских рилсов: список с фильтрами, счётчики решений
 * ИИ за сегодня, отмена отказа и персональные правила автора.
 *
 * Решения ИИ живут в том же `MotivationModerationAudit`, что и решения людей:
 * отдельная таблица развела бы историю поста на две ленты.
 */
@Injectable()
export class MotivationAdminReelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    user: AccessTokenPayload,
    filter: MotivationAdminReelFilter = 'all',
  ): Promise<MotivationAdminReelsResponse> {
    this.assertAdmin(user);
    const posts = await this.prisma.motivationPost.findMany({
      where: { origin: 'user', ...this.filterWhere(filter) },
      include: {
        translations: { where: { language: 'ru' }, take: 1 },
        author: {
          select: {
            id: true,
            name: true,
            spiritualName: true,
            motivationAuthorPolicy: true,
          },
        },
        moderationAudits: {
          orderBy: { createdAt: 'desc' },
          select: {
            action: true,
            reason: true,
            metadata: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const items = posts
      .map((post) => this.dto(post))
      // «Обжалованные» отбираем уже по собранному аудиту: условие по вложенной
      // записи в SQL читалось бы хуже, а список ограничен сотней постов.
      .filter((item) => (filter === 'appealed' ? item.appeal !== null : true));
    return { items, stats: await this.stats() };
  }

  /**
   * Отменить отказ: пост возвращается на проверку текста, а не публикуется
   * сразу — картинки у него ещё нет, и дальше он идёт обычным путём.
   */
  async restore(user: AccessTokenPayload, actorId: string, postId: string) {
    this.assertAdmin(user);
    const post = await this.prisma.motivationPost.findFirst({
      where: { id: postId, origin: 'user' },
      select: { id: true, reviewStatus: true },
    });
    if (!post) throw new NotFoundException('Рилс не найден');
    if (post.reviewStatus !== MotivationReviewStatus.rejected)
      throw new ConflictException('Отменять нечего: рилс не отклонён');
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.motivationPost.updateMany({
        where: { id: postId, reviewStatus: MotivationReviewStatus.rejected },
        data: {
          reviewStatus: MotivationReviewStatus.text_review,
          status: 'draft',
          generationStage: 'ai_escalated',
          generationErrorCode: null,
        },
      });
      if (updated.count !== 1)
        throw new ConflictException('Состояние изменилось, обновите страницу');
      await transaction.motivationModerationAudit.create({
        data: {
          postId,
          actorId,
          action: 'override',
          reason: null,
          metadata: {
            oldStatus: MotivationReviewStatus.rejected,
            newStatus: MotivationReviewStatus.text_review,
          },
        },
      });
      return { id: postId, reviewStatus: MotivationReviewStatus.text_review };
    });
  }

  /** Снять опубликованный рилс из ленты, не удаляя его у автора. */
  async hide(
    user: AccessTokenPayload,
    actorId: string,
    postId: string,
    reason: string,
  ) {
    this.assertAdmin(user);
    const normalized = reason?.trim();
    if (!normalized)
      throw new BadRequestException('Нужна причина: её увидит автор');
    const updated = await this.prisma.motivationPost.updateMany({
      where: { id: postId, origin: 'user', status: 'published' },
      data: { status: 'hidden', generationStage: 'hidden' },
    });
    if (updated.count !== 1)
      throw new ConflictException('Рилс уже не опубликован');
    await this.prisma.motivationModerationAudit.create({
      data: {
        postId,
        actorId,
        action: 'hide',
        reason: normalized,
        metadata: { oldStatus: 'published', newStatus: 'hidden' },
      },
    });
    return { id: postId, status: 'hidden' };
  }

  async policy(
    user: AccessTokenPayload,
    userId: string,
  ): Promise<MotivationAuthorPolicyDto> {
    this.assertAdmin(user);
    const row = await this.prisma.motivationAuthorPolicy.findUnique({
      where: { userId },
    });
    return this.policyDto(row);
  }

  async savePolicy(
    user: AccessTokenPayload,
    userId: string,
    input: MotivationAuthorPolicyUpdate,
  ): Promise<MotivationAuthorPolicyDto> {
    this.assertAdmin(user);
    if (
      input.dailyLimit !== undefined &&
      input.dailyLimit !== null &&
      (!Number.isInteger(input.dailyLimit) ||
        input.dailyLimit < 0 ||
        input.dailyLimit > MAX_LIMIT)
    )
      throw new BadRequestException(
        `Личный лимит — целое число от 0 до ${MAX_LIMIT} или пусто`,
      );
    const note =
      input.note === undefined
        ? undefined
        : (input.note?.trim().slice(0, MAX_NOTE) ?? null) || null;
    const data = {
      ...(input.dailyLimit !== undefined
        ? { dailyLimit: input.dailyLimit }
        : {}),
      ...(input.trusted !== undefined ? { trusted: input.trusted } : {}),
      ...(input.blocked !== undefined ? { blocked: input.blocked } : {}),
      ...(note !== undefined ? { note } : {}),
    };
    if (Object.keys(data).length === 0)
      throw new BadRequestException('Нечего обновлять');
    const row = await this.prisma.motivationAuthorPolicy.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.policyDto(row);
  }

  /** Счётчики решений ИИ за сегодня. */
  private async stats(): Promise<MotivationAiStatsDto> {
    const since = startOfUtcDay(new Date());
    const rows = await this.prisma.motivationModerationAudit.groupBy({
      by: ['action'],
      where: { createdAt: { gte: since } },
      _count: { action: true },
    });
    const count = (action: string) =>
      rows.find((row) => row.action === action)?._count.action ?? 0;
    const approved = count('ai_approve');
    const rejected = count('ai_reject');
    const escalated = count('ai_escalate') + count('ai_suggest');
    const errors = count('ai_error');
    return {
      checked: approved + rejected + escalated + errors,
      approved,
      rejected,
      escalated,
      errors,
      overridden: count('override'),
    };
  }

  private filterWhere(filter: MotivationAdminReelFilter) {
    switch (filter) {
      case 'waiting':
        return { reviewStatus: { in: WAITING } };
      case 'rejected':
        return { reviewStatus: MotivationReviewStatus.rejected };
      case 'published':
        return { status: 'published' as const };
      default:
        return {};
    }
  }

  private dto(post: {
    id: string;
    slug: string;
    status: string;
    reviewStatus: MotivationReviewStatus;
    generationStage: string | null;
    sourceVerified: boolean;
    imageUrl: string | null;
    likeCount: number;
    createdAt: Date;
    translations: { text: string }[];
    author: {
      id: string;
      name: string;
      spiritualName: string | null;
      motivationAuthorPolicy: {
        dailyLimit: number | null;
        trusted: boolean;
        blocked: boolean;
        note: string | null;
      } | null;
    } | null;
    moderationAudits: AuditRow[];
  }): MotivationAdminReelDto {
    const rejection = post.moderationAudits.find(
      (audit) => audit.action === 'reject' || audit.action === 'ai_reject',
    );
    return {
      id: post.id,
      slug: post.slug,
      stage: reelStageOf(post),
      reviewStatus: post.reviewStatus,
      createdAt: post.createdAt.toISOString(),
      authorId: post.author?.id ?? null,
      // Мирское имя: админка и модерация работают с настоящим человеком,
      // а не с духовным именем (исключение из общего правила портала).
      authorName: post.author?.name ?? null,
      authorPolicy: post.author?.motivationAuthorPolicy
        ? this.policyDto(post.author.motivationAuthorPolicy)
        : null,
      sourceVerified: post.sourceVerified,
      quoteText: post.translations[0]?.text ?? '',
      imageUrl: post.imageUrl ?? '',
      likeCount: post.likeCount,
      aiVerdict: adminAiVerdictOf(post.moderationAudits),
      appeal: adminAppealOf(post.moderationAudits),
      rejectionReason: rejection?.reason ?? null,
    };
  }

  private policyDto(
    row: {
      dailyLimit: number | null;
      trusted: boolean;
      blocked: boolean;
      note: string | null;
    } | null,
  ): MotivationAuthorPolicyDto {
    return {
      dailyLimit: row?.dailyLimit ?? null,
      trusted: row?.trusted ?? false,
      blocked: row?.blocked ?? false,
      note: row?.note ?? null,
    };
  }

  private assertAdmin(user: AccessTokenPayload) {
    if (!isAdmin(user)) throw new ForbiddenException();
  }
}
