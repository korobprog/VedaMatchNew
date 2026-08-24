import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MotivationReviewStatus } from '@prisma/client';
import Redis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { MotivationGenerationService } from './motivation-generation.service';
import { MotivationCopyService } from './motivation-copy.service';
import { QuoteDiscoveryService } from './quote-discovery.service';
import { composeStoryImage } from './story-image';
import { attributionLine } from './postcard-events';
import type { MotivationWorkerHealth } from '@vedamatch/shared';
import { isWorkerAlive } from './motivation-worker-health';
import { MotivationSettingsService } from './motivation-settings.service';
import { MotivationModerationService } from './motivation-moderation.service';
import { estimateImageCostUsd, IMAGE_SIZE } from './image-cost';
import { isAutonomousApproval } from './autonomous-approval';
import { classifyAiFailure, isRetryableFailure } from './ai-failure';

/**
 * Код «провайдер занят» и пауза перед следующей попыткой.
 *
 * Отдельный код, а не текст ошибки: по нему и очередь узнаёт отложенный пост,
 * и интерфейс говорит автору «рисуем, как только освободится» вместо «не
 * получилось».
 */
export const PROVIDER_BUSY = 'provider_busy';
const PROVIDER_BUSY_PAUSE_MS = 5 * 60_000;

@Injectable()
export class MotivationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MotivationWorkerService.name);
  private readonly redis: Redis | null;
  private timer?: NodeJS.Timeout;
  private running = false;
  private lastDiscoveryDate?: string;
  /** Начало последнего тика — по нему админка видит, что воркер вообще живой. */
  private lastTickAt: Date | null = null;
  /** Последняя ошибка тика: в админке она нужнее, чем в логах контейнера. */
  private lastError: { at: string; message: string } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: MotivationGenerationService,
    private readonly config: ConfigService,
    private readonly copy: MotivationCopyService,
    @Optional() private readonly discovery?: QuoteDiscoveryService,
    @Optional() private readonly settings?: MotivationSettingsService,
    @Optional() private readonly moderation?: MotivationModerationService,
  ) {
    const host = config.get<string>('REDIS_HOST');
    this.redis = host
      ? new Redis({
          host,
          port: Number(config.get('REDIS_PORT') || 6379),
          db: Number(config.get('REDIS_DB') || 0),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        })
      : null;
  }

  async onModuleInit() {
    if (this.redis)
      await this.redis
        .connect()
        .catch((error) =>
          this.logger.warn(`Redis unavailable: ${String(error)}`),
        );
    await this.retryTodaysFailedJobs();
    this.timer = setInterval(() => void this.tick(), 30_000);
    this.timer.unref();
    void this.tick();
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.redis?.status === 'ready') await this.redis.quit();
  }

  private async retryTodaysFailedJobs() {
    const today = new Date(
      `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
    );
    await this.prisma.motivationPost.updateMany({
      where: {
        contentDate: today,
        reviewStatus: MotivationReviewStatus.failed,
        generationStage: 'image',
        textApprovedAt: { not: null },
        imagePrompt: { not: null },
      },
      data: {
        reviewStatus: MotivationReviewStatus.image_queued,
        status: 'draft',
        generationStage: 'image_queued',
        generationErrorCode: null,
        attemptCount: 0,
      },
    });
  }

  /**
   * Состояние воркера для админки. Отдаёт то, что нельзя увидеть из базы:
   * жив ли лиз в Redis, когда был последний тик и на чём он падал.
   */
  workerHealth(now = new Date()): MotivationWorkerHealth {
    return {
      redis: this.redis ? this.redis.status : 'disabled',
      running: this.running,
      alive: isWorkerAlive(this.lastTickAt, now),
      lastTickAt: this.lastTickAt?.toISOString() ?? null,
      lastError: this.lastError,
    };
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    this.lastTickAt = new Date();
    const lockKey = 'motivation:worker:lease';
    const token = crypto.randomUUID();
    if (this.redis?.status === 'ready') {
      const acquired = await this.redis
        .set(lockKey, token, 'PX', 300_000, 'NX')
        .catch(() => null);
      if (!acquired) {
        this.running = false;
        return;
      }
    }
    try {
      await this.recoverExpiredJobs();
      try {
        await this.ensureDailyDiscovery();
      } catch (error) {
        this.logger.error(
          'Motivation daily discovery failed',
          error instanceof Error ? error.stack : undefined,
        );
      }
      const post = await this.prisma.motivationPost.findFirst({
        where: {
          reviewStatus: MotivationReviewStatus.image_queued,
          status: 'draft',
          generationStage: 'image_queued',
          textApprovedAt: { not: null },
          imagePrompt: { not: null },
          attemptCount: { lt: 3 },
          // Перегруженного провайдера ждём молча: тик раз в 30 секунд бил бы
          // в ту же стену и только копил отказы в журнале.
          OR: [
            { generationErrorCode: { not: PROVIDER_BUSY } },
            {
              updatedAt: { lt: new Date(Date.now() - PROVIDER_BUSY_PAUSE_MS) },
            },
          ],
        },
        orderBy: { createdAt: 'asc' },
      });
      if (!post) return;
      const claimed = await this.prisma.motivationPost.updateMany({
        where: {
          id: post.id,
          reviewStatus: MotivationReviewStatus.image_queued,
          status: 'draft',
          generationStage: 'image_queued',
          textApprovedAt: { not: null },
          imagePrompt: { not: null },
        },
        data: {
          status: 'generating',
          generationStage: 'image',
          attemptCount: { increment: 1 },
        },
      });
      if (!claimed.count) return;
      await this.process(post.id);
    } catch (error) {
      this.lastError = {
        at: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      };
      this.logger.error(
        'Motivation worker tick failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      if (this.redis?.status === 'ready')
        await this.redis
          .eval(
            "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
            1,
            lockKey,
            token,
          )
          .catch(() => undefined);
      this.running = false;
    }
  }

  private async recoverExpiredJobs() {
    const expiredAt = new Date(Date.now() - 5 * 60_000);
    await this.prisma.motivationPost.updateMany({
      where: {
        reviewStatus: MotivationReviewStatus.image_queued,
        status: 'generating',
        generationStage: 'image',
        textApprovedAt: { not: null },
        imagePrompt: { not: null },
        updatedAt: { lt: expiredAt },
        attemptCount: { lt: 3 },
      },
      data: {
        status: 'draft',
        generationStage: 'image_queued',
        generationErrorCode: 'lease_expired',
      },
    });
    await this.prisma.motivationPost.updateMany({
      where: {
        reviewStatus: MotivationReviewStatus.image_queued,
        status: 'generating',
        generationStage: 'image',
        textApprovedAt: { not: null },
        imagePrompt: { not: null },
        updatedAt: { lt: expiredAt },
        attemptCount: { gte: 3 },
      },
      data: {
        reviewStatus: MotivationReviewStatus.failed,
        status: 'failed',
        generationErrorCode: 'lease_expired',
      },
    });
  }

  private async ensureDailyDiscovery() {
    if (!this.discovery) return;
    const dateKey = new Date().toISOString().slice(0, 10);
    const idempotencyKey = `motivation:discovery:${dateKey}`;
    if (this.lastDiscoveryDate === dateKey) return;
    if (
      this.redis?.status === 'ready' &&
      (await this.redis.get(idempotencyKey).catch(() => null))
    )
      return;

    const count = Number(
      this.config.get('MOTIVATION_DAILY_CANDIDATE_COUNT') || 8,
    );
    const today = new Date(`${dateKey}T00:00:00.000Z`);
    const quotes = await this.discovery.discoverDaily(today, count);
    for (const quote of quotes) await this.copy.prepareCandidate(quote.id);
    if (this.redis?.status === 'ready') {
      await this.redis
        .set(idempotencyKey, 'done', 'EX', 8 * 24 * 60 * 60)
        .catch((error) => {
          this.logger.warn(
            `Unable to store Motivation discovery idempotency key: ${String(error)}`,
          );
        });
    }
    this.lastDiscoveryDate = dateKey;
  }

  private async process(id: string) {
    const post = await this.prisma.motivationPost.findUnique({
      where: { id },
      include: {
        translations: { where: { language: 'ru' }, take: 1 },
        quote: true,
      },
    });
    if (
      !post ||
      post.reviewStatus !== MotivationReviewStatus.image_queued ||
      !post.textApprovedAt ||
      !post.imagePrompt
    )
      return;
    try {
      this.logger.log(`Generating Motivation image ${post.slug}`);
      const image = await this.generation.generateApprovedImage({
        imagePrompt: post.imagePrompt,
        textApprovedAt: post.textApprovedAt,
      });
      const version = Date.now();
      const baseKey = `motivation/${post.contentDate.toISOString().slice(0, 10)}/${post.id}/v${version}`;
      const imageUrl = await this.generation.uploadStory(
        `${baseKey}.png`,
        image.bytes,
      );
      // Сторис — отдельный файл: тот же фон, докадрированный до 9:16, плюс
      // текст и подпись. Раньше сюда клался тот же imageUrl, и «Скачать для
      // Stories» отдавало картинку без единого слова.
      // Если композит не удался, откатываемся на чистую картинку: кнопка
      // «Скачать для Stories» должна остаться рабочей. Сам сбой логируется как
      // ошибка — иначе пропавшие в образе шрифты молча вернули бы сторис без
      // текста, ровно ту проблему, ради которой всё и делалось.
      const storyImageUrl =
        (await this.composeStory(post, image.bytes, baseKey)) ?? imageUrl;
      // Пользовательский рилс, текст которого одобрил ИИ в автономном режиме,
      // публикуется сразу: человек в этой цепочке — оператор, а не этап.
      // Редакционные посты и режим «подсказывает» по-прежнему ждут админа.
      const autoPublish = await this.shouldAutoPublish(post);
      const now = new Date();
      const updated = await this.prisma.motivationPost.updateMany({
        where: {
          id,
          reviewStatus: MotivationReviewStatus.image_queued,
          status: 'generating',
          generationStage: 'image',
        },
        data: autoPublish
          ? {
              reviewStatus: MotivationReviewStatus.published,
              status: 'published',
              generationStage: 'published',
              generationErrorCode: null,
              imageUrl,
              storyImageUrl,
              imageApprovedAt: now,
              publishedAt: now,
              modelVersion: 'responses:image_generation',
              // Кадр — единственная платная стадия текстового конвейера,
              // и до сих пор её цена никуда не писалась. Считаем по размеру
              // запроса: без этого дневной потолок сторожит только видео.
              // Ставка зависит от того, кто нарисовал: у запасного поставщика
              // она втрое выше.
              estimatedCostUsd: {
                increment: estimateImageCostUsd(IMAGE_SIZE, image.provider),
              },
            }
          : {
              reviewStatus: MotivationReviewStatus.image_review,
              status: 'draft',
              generationStage: 'image_review',
              generationErrorCode: null,
              imageUrl,
              storyImageUrl,
              modelVersion: 'responses:image_generation',
              // Кадр — единственная платная стадия текстового конвейера,
              // и до сих пор её цена никуда не писалась. Считаем по размеру
              // запроса: без этого дневной потолок сторожит только видео.
              // Ставка зависит от того, кто нарисовал: у запасного поставщика
              // она втрое выше.
              estimatedCostUsd: {
                increment: estimateImageCostUsd(IMAGE_SIZE, image.provider),
              },
            },
      });
      if (autoPublish && updated.count === 1) {
        // Автор узнаёт о публикации из колокольчика: экран мастера он к этому
        // моменту, скорее всего, уже закрыл.
        this.moderation?.notifyPublished({
          id: post.id,
          slug: post.slug,
          origin: post.origin,
          authorUserId: post.authorUserId,
        });
        await this.prisma.motivationModerationAudit.create({
          data: {
            postId: id,
            actorId: null,
            action: 'ai_publish',
            reason: null,
            metadata: {
              actor: 'ai',
              oldStatus: 'image_queued',
              newStatus: 'published',
            },
          },
        });
      }
    } catch (error) {
      const current = await this.prisma.motivationPost.findUnique({
        where: { id },
        select: { attemptCount: true, reviewStatus: true, status: true },
      });
      if (
        current?.reviewStatus === MotivationReviewStatus.image_queued &&
        current.status === 'generating'
      ) {
        // Перегрузка провайдера — не вина рилса: попытку возвращаем, иначе
        // три отказа подряд за полторы минуты хоронят кадр, который просто
        // некому было нарисовать. Провайдер отвечает на это 429, а его канал
        // 503 — оба разбирает `classifyAiFailure`.
        const busy = isRetryableFailure(classifyAiFailure(error));
        const retryable = busy || current.attemptCount < 3;
        await this.prisma.motivationPost.updateMany({
          where: {
            id,
            reviewStatus: MotivationReviewStatus.image_queued,
            status: 'generating',
            generationStage: 'image',
          },
          data: {
            reviewStatus: retryable
              ? MotivationReviewStatus.image_queued
              : MotivationReviewStatus.failed,
            status: retryable ? 'draft' : 'failed',
            generationStage: retryable ? 'image_queued' : 'image',
            generationErrorCode: busy
              ? PROVIDER_BUSY
              : error instanceof Error
                ? error.message.slice(0, 200)
                : 'generation_failed',
            ...(busy ? { attemptCount: { decrement: 1 } } : {}),
          },
        });
      }
      this.logger.error(
        `Motivation image generation failed for ${id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Кадр для сторис. Если композит не удался — отдаём чистую картинку: пост
   * из-за подписи срываться не должен, он уже сгенерирован и оплачен.
   */
  /**
   * Автопубликация после картинки: только пользовательские посты, только в
   * автономном режиме ИИ-модерации и только если текст одобрил именно ИИ
   * (а не админ вручную — тогда он и картинку посмотрит сам).
   */
  private async shouldAutoPublish(post: {
    id: string;
    origin?: string;
  }): Promise<boolean> {
    if (!this.settings) return false;
    const settings = await this.settings.read();
    const approval = await this.prisma.motivationModerationAudit.findFirst({
      where: {
        postId: post.id,
        action: { in: ['ai_approve', 'approve_text'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { action: true },
    });
    return isAutonomousApproval({
      origin: post.origin,
      moderationMode: settings.aiModerationMode,
      lastApprovalAction: approval?.action,
    });
  }

  private async composeStory(
    post: {
      storyCaption: boolean;
      translations: Array<{ storyText: string }>;
      quote: {
        originalText: string;
        author: string;
        work: string;
        locator: string;
      } | null;
      attributionSpeaker: string | null;
      attributionWork: string | null;
      attributionLocator: string | null;
    },
    image: Buffer,
    baseKey: string,
  ): Promise<string | undefined> {
    if (!post.storyCaption) return undefined;
    const text =
      post.translations[0]?.storyText?.trim() ||
      post.quote?.originalText?.trim();
    if (!text) return undefined;

    const attribution = attributionLine({
      attributionSpeaker: post.quote?.author ?? post.attributionSpeaker,
      attributionWork: post.quote?.work ?? post.attributionWork,
      attributionLocator: post.quote?.locator ?? post.attributionLocator,
    });

    try {
      const story = await composeStoryImage(image, { text, attribution });
      return await this.generation.uploadStory(`${baseKey}-story.png`, story);
    } catch (error) {
      this.logger.error(
        `Unable to compose Motivation story image: ${String(error)}`,
      );
      return undefined;
    }
  }
}
