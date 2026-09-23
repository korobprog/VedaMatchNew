import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MotivationGenerationService } from './motivation-generation.service';
import { attributionLine } from './postcard-events';
import {
  composeSavedImage,
  savedImageKey,
  savedImagePlan,
  type SavedImagePlan,
} from './saved-image';
import {
  DEFAULT_SAVED_IMAGE_QUALITY,
  savedImageFileType,
  type SavedImageQuality,
} from './saved-image-quality';

export type SavedImageResult =
  /** Файл уже лежит в хранилище — отдаём ссылку на него. */
  | { kind: 'stored'; url: string }
  /** Хранилища нет (dev) или записать не вышло — отдаём байты напрямую. */
  | { kind: 'bytes'; bytes: Buffer; contentType: string };

/**
 * Файл для «Сохранить картинку» и «Отправить в приложение» (VED-227,
 * VED-247, VED-156). Вёрстка — в `saved-image.ts`, здесь только чтение поста,
 * кэш в хранилище и защита от одновременной сборки одного и того же файла.
 */
@Injectable()
export class MotivationSavedImageService {
  private readonly logger = new Logger(MotivationSavedImageService.name);
  /**
   * Сборки в работе по ключу. Экран «Поделиться» запрашивает файл сразу при
   * открытии, и два человека, открывшие свежий пост одновременно, не должны
   * собирать его дважды.
   */
  private readonly inflight = new Map<string, Promise<SavedImageResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: MotivationGenerationService,
  ) {}

  async forSlug(
    slug: string,
    quality: SavedImageQuality = DEFAULT_SAVED_IMAGE_QUALITY,
  ): Promise<SavedImageResult> {
    const post = await this.prisma.motivationPost.findFirst({
      where: { slug, status: 'published' },
      select: {
        id: true,
        imageUrl: true,
        imageSource: true,
        captionInImage: true,
        storyCaption: true,
        attributionSpeaker: true,
        attributionWork: true,
        attributionLocator: true,
        translations: {
          where: { language: 'ru' },
          take: 1,
          select: { storyText: true },
        },
        quote: {
          select: {
            originalText: true,
            author: true,
            work: true,
            locator: true,
          },
        },
      },
    });
    if (!post) throw new NotFoundException('Публикация не найдена');

    // Подпись — тем же правилом, что у воркера сторис и открыток.
    const plan = savedImagePlan({
      id: post.id,
      imageUrl: post.imageUrl,
      imageSource: post.imageSource,
      captionInImage: post.captionInImage,
      storyCaption: post.storyCaption,
      storyText: post.translations[0]?.storyText ?? null,
      quoteText: post.quote?.originalText ?? null,
      attribution: attributionLine({
        attributionSpeaker: post.quote?.author ?? post.attributionSpeaker,
        attributionWork: post.quote?.work ?? post.attributionWork,
        attributionLocator: post.quote?.locator ?? post.attributionLocator,
      }),
    });
    if (!plan) throw new NotFoundException('У публикации нет картинки');

    const key = savedImageKey(post.id, plan, quality);
    const running = this.inflight.get(key);
    if (running) return running;
    const task = this.resolve(key, plan, quality).finally(() =>
      this.inflight.delete(key),
    );
    this.inflight.set(key, task);
    return task;
  }

  private async resolve(
    key: string,
    plan: SavedImagePlan,
    quality: SavedImageQuality,
  ): Promise<SavedImageResult> {
    const stored = await this.generation.findUploaded(key);
    if (stored) return { kind: 'stored', url: stored };

    const response = await fetch(plan.background, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new NotFoundException('Исходная картинка недоступна');
    const bytes = await composeSavedImage(
      Buffer.from(await response.arrayBuffer()),
      plan,
      quality,
    );
    const { contentType } = savedImageFileType(quality);
    try {
      const url = await this.generation.uploadStory(key, bytes, contentType);
      return { kind: 'stored', url };
    } catch (error) {
      // Без хранилища (локальная разработка) или при его сбое файл всё равно
      // нужен человеку прямо сейчас — отдаём собранное, кэш подождёт.
      this.logger.warn(`Saved image not cached (${key}): ${String(error)}`);
      return { kind: 'bytes', bytes, contentType };
    }
  }
}
