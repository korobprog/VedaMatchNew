import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MotivationReviewStatus, MotivationVisualStyle } from '@prisma/client';
import type { Role } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { createImageDirection } from './motivation-image-director';

const reviewableStatuses = new Set<MotivationReviewStatus>([
  MotivationReviewStatus.discovered,
  MotivationReviewStatus.source_verified,
  MotivationReviewStatus.text_review,
  MotivationReviewStatus.image_queued,
  MotivationReviewStatus.image_review,
  MotivationReviewStatus.failed,
]);
const approvedStyles = new Set<string>(Object.values(MotivationVisualStyle));

@Injectable()
export class MotivationModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async approveText(role: Role, actorId: string, postId: string, styleOverride?: MotivationVisualStyle) {
    this.assertAdmin(role);
    this.assertApprovedStyle(styleOverride);
    const post = await this.loadPost(postId);
    if (post.reviewStatus !== MotivationReviewStatus.text_review) throw new ConflictException('Text is not ready for review');
    const direction = createImageDirection({
      meaning: post.translations[0]?.text ?? post.quote?.contextExcerpt ?? post.quote?.originalText ?? post.category,
      category: post.category,
      author: post.quote?.author ?? post.attributionSpeaker,
      work: post.quote?.work ?? post.attributionWork,
      profileTypes: post.quote?.profiles.map((profile) => profile.profileType) ?? [post.profileType],
    }, styleOverride);
    const now = new Date();
    return this.transition({
      postId,
      actorId,
      expected: MotivationReviewStatus.text_review,
      next: MotivationReviewStatus.image_queued,
      action: 'approve_text',
      style: direction.style,
      reason: null,
      data: {
        reviewStatus: MotivationReviewStatus.image_queued,
        visualStyle: direction.style,
        imagePrompt: direction.prompt,
        textApprovedAt: now,
        generationStage: 'image_queued',
        generationErrorCode: null,
      },
    });
  }

  async approveImage(role: Role, actorId: string, postId: string) {
    this.assertAdmin(role);
    const post = await this.loadPost(postId);
    if (post.reviewStatus !== MotivationReviewStatus.image_review) throw new ConflictException('Image is not ready for review');
    if (!post.imageUrl) throw new ConflictException('Image is not ready for review');
    const now = new Date();
    return this.transition({
      postId,
      actorId,
      expected: MotivationReviewStatus.image_review,
      next: MotivationReviewStatus.published,
      action: 'approve_image',
      style: post.visualStyle,
      reason: null,
      data: {
        reviewStatus: MotivationReviewStatus.published,
        status: 'published',
        imageApprovedAt: now,
        publishedAt: now,
        generationStage: 'published',
        generationErrorCode: null,
      },
    });
  }

  async reject(role: Role, actorId: string, postId: string, reason: string) {
    this.assertAdmin(role);
    const normalizedReason = reason?.trim();
    if (!normalizedReason) throw new BadRequestException('Rejection reason is required');
    const post = await this.loadPost(postId);
    if (!reviewableStatuses.has(post.reviewStatus)) throw new ConflictException('Post can no longer be rejected');
    return this.transition({
      postId,
      actorId,
      expected: post.reviewStatus,
      next: MotivationReviewStatus.rejected,
      action: 'reject',
      style: post.visualStyle,
      reason: normalizedReason,
      data: {
        reviewStatus: MotivationReviewStatus.rejected,
        status: 'draft',
        generationStage: 'rejected',
        generationErrorCode: null,
      },
    });
  }

  async regenerateImage(role: Role, actorId: string, postId: string, styleOverride?: MotivationVisualStyle) {
    this.assertAdmin(role);
    this.assertApprovedStyle(styleOverride);
    const post = await this.loadPost(postId);
    if (post.reviewStatus !== MotivationReviewStatus.image_review) throw new ConflictException('Image is not ready for regeneration');
    const direction = createImageDirection({
      meaning: post.translations[0]?.text ?? post.quote?.contextExcerpt ?? post.quote?.originalText ?? post.category,
      category: post.category,
      author: post.quote?.author ?? post.attributionSpeaker,
      work: post.quote?.work ?? post.attributionWork,
      profileTypes: post.quote?.profiles.map((profile) => profile.profileType) ?? [post.profileType],
    }, styleOverride ?? post.visualStyle ?? undefined);
    return this.transition({
      postId,
      actorId,
      expected: MotivationReviewStatus.image_review,
      next: MotivationReviewStatus.image_queued,
      action: 'regenerate_image',
      style: direction.style,
      reason: null,
      data: {
        reviewStatus: MotivationReviewStatus.image_queued,
        status: 'draft',
        visualStyle: direction.style,
        imagePrompt: direction.prompt,
        imageUrl: null,
        storyImageUrl: null,
        imageApprovedAt: null,
        publishedAt: null,
        generationStage: 'image_queued',
        generationErrorCode: null,
        attemptCount: 0,
      },
    });
  }

  private loadPost(postId: string) {
    return this.prisma.motivationPost.findUnique({
      where: { id: postId },
      include: {
        translations: { where: { language: 'ru' }, take: 1 },
        quote: { include: { profiles: true } },
      },
    }).then((post) => {
      if (!post) throw new NotFoundException('Motivation post not found');
      return post;
    });
  }

  private transition(input: {
    postId: string;
    actorId: string;
    expected: MotivationReviewStatus;
    next: MotivationReviewStatus;
    action: string;
    style: MotivationVisualStyle | null;
    reason: string | null;
    data: Record<string, unknown>;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.motivationPost.updateMany({
        where: { id: input.postId, reviewStatus: input.expected },
        data: input.data,
      });
      if (updated.count !== 1) throw new ConflictException('Moderation state changed; reload the post');
      await transaction.motivationModerationAudit.create({
        data: {
          postId: input.postId,
          actorId: input.actorId,
          action: input.action,
          reason: input.reason,
          metadata: {
            oldStatus: input.expected,
            newStatus: input.next,
            style: input.style,
            reason: input.reason,
          },
        },
      });
      return { id: input.postId, reviewStatus: input.next };
    });
  }

  private assertAdmin(role: Role) {
    if (role !== 'admin' && role !== 'service-admin') throw new ForbiddenException();
  }

  private assertApprovedStyle(style?: MotivationVisualStyle) {
    if (style && !approvedStyles.has(style)) throw new BadRequestException('Visual style is not approved');
  }
}
