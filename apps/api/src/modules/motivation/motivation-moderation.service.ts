import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MotivationReviewStatus, MotivationVisualStyle } from '@prisma/client';
import type { MotivationPromptUpdate, Role } from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { createImageDirection } from './motivation-image-director';
import {
  isPromptTooLong,
  normalizeEditedPrompt,
  shouldKeepEditedImagePrompt,
} from './motivation-prompt';

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
  constructor(
    private readonly prisma: PrismaService,
    // Необязательная: модерация работает и без шины, уведомление автору —
    // побочный эффект, ради которого публикация падать не должна.
    @Optional() private readonly events?: EventEmitter2,
  ) {}

  /**
   * Уведомление автору пользовательского рилса о публикации. Событие
   * самодостаточно: получатель и slug, ничего дочитывать не нужно.
   */
  notifyPublished(post: {
    id: string;
    slug: string;
    origin: string;
    authorUserId: string | null;
  }): void {
    if (post.origin !== 'user' || !post.authorUserId || !this.events) return;
    this.events.emit('motivation.reel.published', {
      name: 'motivation.reel.published',
      recipientId: post.authorUserId,
      reelId: post.id,
      slug: post.slug,
    });
  }

  async approveText(
    role: Role,
    actorId: string,
    postId: string,
    styleOverride?: MotivationVisualStyle,
  ) {
    this.assertAdmin(role);
    this.assertApprovedStyle(styleOverride);
    return this.approveTextWith({
      actorId,
      postId,
      styleOverride,
      action: 'approve_text',
      metadata: {},
    });
  }

  /**
   * Одобрение текста ИИ-модератором. Актор пуст — FK аудита смотрит на
   * `User`, а модель им не является; кто именно решил, лежит в metadata.
   */
  aiApproveText(
    postId: string,
    styleOverride: MotivationVisualStyle | undefined,
    verdict: Record<string, unknown>,
  ) {
    this.assertApprovedStyle(styleOverride);
    return this.approveTextWith({
      actorId: null,
      postId,
      styleOverride,
      action: 'ai_approve',
      metadata: { actor: 'ai', verdict },
    });
  }

  /** Отказ ИИ-модератора: причина — текст для автора. */
  async aiReject(
    postId: string,
    reason: string,
    verdict: Record<string, unknown>,
  ) {
    const post = await this.loadPost(postId);
    if (post.reviewStatus !== MotivationReviewStatus.text_review)
      throw new ConflictException('Text is not ready for review');
    return this.transition({
      postId,
      actorId: null,
      expected: MotivationReviewStatus.text_review,
      next: MotivationReviewStatus.rejected,
      action: 'ai_reject',
      style: post.visualStyle,
      reason,
      data: {
        reviewStatus: MotivationReviewStatus.rejected,
        status: 'draft',
        generationStage: 'rejected',
        generationErrorCode: null,
      },
      metadata: { actor: 'ai', verdict },
    });
  }

  /**
   * Запись ИИ-модератора без смены статуса: подсказка админу, эскалация или
   * сбой модели. Стадия генерации помечается, чтобы автор видел «ждёт
   * администратора», а не вечную «проверку».
   */
  async aiNote(
    postId: string,
    action: 'ai_suggest' | 'ai_escalate' | 'ai_error',
    reason: string | null,
    metadata: Record<string, unknown>,
  ) {
    const stage = action === 'ai_suggest' ? 'ai_suggested' : 'ai_escalated';
    await this.prisma.$transaction(async (transaction) => {
      await transaction.motivationPost.updateMany({
        where: {
          id: postId,
          reviewStatus: MotivationReviewStatus.text_review,
        },
        data: { generationStage: stage },
      });
      await transaction.motivationModerationAudit.create({
        data: {
          postId,
          actorId: null,
          action,
          reason,
          metadata: { actor: 'ai', ...metadata },
        },
      });
    });
  }

  private async approveTextWith(input: {
    actorId: string | null;
    postId: string;
    styleOverride?: MotivationVisualStyle;
    action: string;
    metadata: Record<string, unknown>;
  }) {
    const post = await this.loadPost(input.postId);
    if (post.reviewStatus !== MotivationReviewStatus.text_review)
      throw new ConflictException('Text is not ready for review');
    const direction = createImageDirection(
      {
        meaning:
          post.translations[0]?.text ??
          post.quote?.contextExcerpt ??
          post.quote?.originalText ??
          post.category,
        category: post.category,
        author: post.quote?.author ?? post.attributionSpeaker,
        work: post.quote?.work ?? post.attributionWork,
        locator: post.quote?.locator ?? post.attributionLocator,
        contextExcerpt: post.quote?.contextExcerpt,
        profileTypes: post.quote?.profiles.map(
          (profile) => profile.profileType,
        ) ?? [post.profileType],
      },
      input.styleOverride,
    );
    const now = new Date();
    return this.transition({
      postId: input.postId,
      actorId: input.actorId,
      expected: MotivationReviewStatus.text_review,
      next: MotivationReviewStatus.image_queued,
      action: input.action,
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
      metadata: input.metadata,
    });
  }

  async approveImage(role: Role, actorId: string, postId: string) {
    this.assertAdmin(role);
    const post = await this.loadPost(postId);
    const notify = () => this.notifyPublished(post);
    if (post.reviewStatus !== MotivationReviewStatus.image_review)
      throw new ConflictException('Image is not ready for review');
    if (!post.imageUrl)
      throw new ConflictException('Image is not ready for review');
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
    }).then((result) => {
      notify();
      return result;
    });
  }

  async reject(role: Role, actorId: string, postId: string, reason: string) {
    this.assertAdmin(role);
    const normalizedReason = reason?.trim();
    if (!normalizedReason)
      throw new BadRequestException('Rejection reason is required');
    const post = await this.loadPost(postId);
    if (!reviewableStatuses.has(post.reviewStatus))
      throw new ConflictException('Post can no longer be rejected');
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

  async regenerateImage(
    role: Role,
    actorId: string,
    postId: string,
    styleOverride?: MotivationVisualStyle,
  ) {
    this.assertAdmin(role);
    this.assertApprovedStyle(styleOverride);
    const post = await this.loadPost(postId);
    if (post.reviewStatus !== MotivationReviewStatus.image_review)
      throw new ConflictException('Image is not ready for regeneration');
    const direction = createImageDirection(
      {
        meaning:
          post.translations[0]?.text ??
          post.quote?.contextExcerpt ??
          post.quote?.originalText ??
          post.category,
        category: post.category,
        author: post.quote?.author ?? post.attributionSpeaker,
        work: post.quote?.work ?? post.attributionWork,
        locator: post.quote?.locator ?? post.attributionLocator,
        contextExcerpt: post.quote?.contextExcerpt,
        profileTypes: post.quote?.profiles.map(
          (profile) => profile.profileType,
        ) ?? [post.profileType],
      },
      styleOverride ?? post.visualStyle ?? undefined,
    );
    // Правку человека черновиком не затираем: ради неё промпт и открывали.
    const keepEdited = shouldKeepEditedImagePrompt({
      editedAt: post.imagePromptEditedAt,
      currentStyle: post.visualStyle,
      requestedStyle: styleOverride,
    });
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
        imagePrompt: keepEdited ? post.imagePrompt : direction.prompt,
        // Смена стиля пересобирает черновик, а значит отметка о правке больше
        // не описывает то, что лежит в поле.
        ...(keepEdited ? {} : { imagePromptEditedAt: null }),
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

  /**
   * Сохраняет промпты, которые правил человек.
   *
   * Автосборка теперь только черновик: администратор видит, что уйдёт в
   * генерацию, и правит текст до того, как это станет картинкой или роликом.
   * Раньше он мог лишь смотреть, а несовпадение промпта с задумкой лечилось
   * перегенерацией наугад — за деньги и без гарантии.
   *
   * Статус поста при этом не меняется: правка промпта — не переход по
   * пайплайну, а подготовка следующего запуска. Поэтому и `transition()` тут
   * не годится — он требует ожидаемого и следующего статуса.
   */
  async savePrompts(
    role: Role,
    actorId: string,
    postId: string,
    input: MotivationPromptUpdate,
  ) {
    this.assertAdmin(role);
    if (input.imagePrompt === undefined && input.videoPrompt === undefined)
      throw new BadRequestException('Nothing to save');

    const data: Record<string, unknown> = {};
    if (input.imagePrompt !== undefined) {
      const imagePrompt = normalizeEditedPrompt(input.imagePrompt);
      // Пустой промпт иллюстрации — не «вернуть автосборку», а «не из чего
      // генерировать»: воркер такой пост просто не возьмёт и молча оставит
      // висеть в очереди.
      if (!imagePrompt)
        throw new BadRequestException('Image prompt cannot be empty');
      if (isPromptTooLong(imagePrompt))
        throw new BadRequestException('Image prompt is too long');
      data.imagePrompt = imagePrompt;
      data.imagePromptEditedAt = new Date();
    }
    if (input.videoPrompt !== undefined) {
      // А вот пустой промпт видео осмыслен: это откат к общему дефолту про
      // мягкое естественное движение, и отдельная кнопка для него не нужна.
      const videoPrompt = normalizeEditedPrompt(input.videoPrompt);
      if (videoPrompt && isPromptTooLong(videoPrompt))
        throw new BadRequestException('Video prompt is too long');
      data.videoPrompt = videoPrompt;
    }

    const post = await this.loadPost(postId);
    return this.prisma.$transaction(async (transaction) => {
      await transaction.motivationPost.update({
        where: { id: postId },
        data,
      });
      await transaction.motivationModerationAudit.create({
        data: {
          postId,
          actorId,
          action: 'edit_prompts',
          reason: null,
          metadata: {
            fields: Object.keys(data).filter(
              (field) => field !== 'imagePromptEditedAt',
            ),
            status: post.reviewStatus,
          },
        },
      });
      return {
        id: postId,
        imagePrompt:
          (data.imagePrompt as string | undefined) ?? post.imagePrompt,
        imagePromptEdited:
          data.imagePromptEditedAt !== undefined ||
          Boolean(post.imagePromptEditedAt),
        videoPrompt:
          input.videoPrompt === undefined
            ? post.videoPrompt
            : (data.videoPrompt as string | null),
      };
    });
  }

  private loadPost(postId: string) {
    return this.prisma.motivationPost
      .findUnique({
        where: { id: postId },
        include: {
          translations: { where: { language: 'ru' }, take: 1 },
          quote: { include: { profiles: true } },
        },
      })
      .then((post) => {
        if (!post) throw new NotFoundException('Motivation post not found');
        return post;
      });
  }

  private transition(input: {
    postId: string;
    actorId: string | null;
    expected: MotivationReviewStatus;
    next: MotivationReviewStatus;
    action: string;
    style: MotivationVisualStyle | null;
    reason: string | null;
    data: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.motivationPost.updateMany({
        where: { id: input.postId, reviewStatus: input.expected },
        data: input.data,
      });
      if (updated.count !== 1)
        throw new ConflictException(
          'Moderation state changed; reload the post',
        );
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
            ...(input.metadata ?? {}),
          },
        },
      });
      return { id: input.postId, reviewStatus: input.next };
    });
  }

  private assertAdmin(role: Role) {
    if (role !== 'admin' && role !== 'service-admin')
      throw new ForbiddenException();
  }

  private assertApprovedStyle(style?: MotivationVisualStyle) {
    if (style && !approvedStyles.has(style))
      throw new BadRequestException('Visual style is not approved');
  }
}
