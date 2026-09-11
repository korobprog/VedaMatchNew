import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type {
  AccessTokenPayload,
  MotivationLanguage,
  MotivationPictureResult,
} from '@vedamatch/shared';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { isAdmin } from './is-admin';
import { MotivationCategoriesService } from './motivation-categories.service';
import { MotivationGenerationService } from './motivation-generation.service';
import {
  PICTURE_MAX_SIDE,
  normalizePictureInput,
  pictureImageKey,
  pictureInputMessage,
  pictureTitle,
} from './picture-post';
import {
  MIN_REEL_IMAGE_SIDE,
  type UploadedReelImage,
  reelImageMessage,
  validateReelImage,
} from './reel-image';
import { startOfUtcDay } from './reel-stages';

const LANGUAGES: readonly MotivationLanguage[] = ['ru', 'en', 'hi'];

/**
 * Готовые картинки с афоризмами от редакции — сразу в категорию (VED-87).
 *
 * До этого единственным путём было завести пост текстом, дождаться
 * генерации и заменить её картинку своей. Для открытки, где цитата уже
 * напечатана, это три лишних шага и платная генерация, которую выбросят.
 *
 * Пост публикуется сразу: файл кладёт администратор, проверять его не у
 * кого. Воркер его не видит — стадия уже `published`.
 */
@Injectable()
export class MotivationPicturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: MotivationCategoriesService,
    private readonly generation: MotivationGenerationService,
  ) {}

  async create(
    user: AccessTokenPayload,
    file: UploadedReelImage | undefined,
    body: unknown,
  ): Promise<MotivationPictureResult> {
    if (!isAdmin(user)) throw new ForbiddenException('Только администратор');
    const problem = validateReelImage(file);
    if (problem) throw new BadRequestException(reelImageMessage(problem));
    const input = normalizePictureInput(body);
    if (typeof input === 'string')
      throw new BadRequestException(pictureInputMessage(input));

    // Неизвестный слаг — ошибка, а не молчаливая категория по умолчанию:
    // картинка, которую несли в «Шастры», не должна тихо осесть в другом месте.
    const category = await this.categories.resolveSlug(input.category);
    const categoryRow = await this.prisma.motivationCategory.findUnique({
      where: { slug: category },
      select: { title: true },
    });

    const id = randomUUID();
    const imageUrl = await this.store(id, file!);
    const title = pictureTitle(input.text, categoryRow?.title ?? category);
    const now = new Date();

    const post = await this.prisma.motivationPost.create({
      data: {
        id,
        slug: `picture-${id}`,
        contentDate: startOfUtcDay(now),
        // Профиль у поста один, а картинку несут в раздел для всех, кто его
        // откроет. Основная лента показывает такие посты всем профилям — см.
        // `captionInImage` в `MotivationService.feed`.
        profileType: 'user',
        audienceTrack: 'universal',
        category,
        status: 'published',
        reviewStatus: 'published',
        publishedAt: now,
        textApprovedAt: now,
        imageApprovedAt: now,
        origin: 'editorial',
        authorUserId: user.sub,
        imageSource: 'uploaded',
        captionInImage: true,
        // Подпись для Stories не накладываем: она уже на картинке.
        storyCaption: false,
        sourceVerified: true,
        attributionKind: 'exact_quote',
        attributionSpeaker: input.author || null,
        imageUrl,
        storyImageUrl: imageUrl,
        generationStage: 'uploaded',
        promptVersion: 'picture-v1',
        translations: {
          // Текст один на все языки: перевести надпись на картинке нельзя, а
          // пустой перевод оставил бы читателю с другим языком пустой заголовок.
          create: LANGUAGES.map((language) => ({
            language,
            title,
            text: input.text,
            storyText: input.text,
          })),
        },
      },
      select: { id: true, slug: true },
    });

    await this.prisma.motivationModerationAudit.create({
      data: {
        postId: post.id,
        actorId: user.sub,
        action: 'admin_picture',
        reason: null,
        metadata: { category },
      },
    });

    return { postId: post.id, slug: post.slug, category, imageUrl };
  }

  /**
   * Поворот по EXIF и сжатие в WebP. Без обрезки: у кадра рилса её
   * оправдывает вертикальный формат, а здесь надпись у края пропала бы
   * первой.
   */
  private async store(
    postId: string,
    file: UploadedReelImage,
  ): Promise<string> {
    const image = sharp(file.buffer, {
      failOn: 'error',
      limitInputPixels: true,
    }).rotate();
    const meta = await image.metadata();
    const width = meta.width ?? 0,
      height = meta.height ?? 0;
    if (Math.min(width, height) < MIN_REEL_IMAGE_SIDE)
      throw new BadRequestException(reelImageMessage('image_too_small'));

    const prepared = await image
      .resize(PICTURE_MAX_SIDE, PICTURE_MAX_SIDE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      // Надпись мелкая и контрастная: при q82, как у кадров рилсов, вокруг
      // букв появляется заметная рябь.
      .webp({ quality: 88 })
      .toBuffer();
    return this.generation.uploadStory(
      pictureImageKey(postId, Date.now()),
      prepared,
      'image/webp',
    );
  }
}
