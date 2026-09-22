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
import { MotivationSettingsService } from './motivation-settings.service';
import {
  PICTURE_MAX_SIDE,
  normalizePictureInput,
  pictureImageKey,
  pictureInputMessage,
  pictureTitle,
} from './picture-post';
import {
  type UploadedReelImage,
  reelImageMessage,
  reelImageSizeMessage,
  validateReelImage,
  validateReelImageSize,
} from './reel-image';
import { startOfUtcDay } from './reel-stages';

const LANGUAGES: readonly MotivationLanguage[] = ['ru', 'en', 'hi'];

/**
 * Готовые картинки с афоризмами — сразу в категорию.
 *
 * Сначала это умела только редакция (VED-87): до того единственным путём
 * было завести пост текстом, дождаться генерации и заменить её картинку
 * своей. Для открытки, где цитата уже напечатана, это три лишних шага и
 * платная генерация, которую выбросят.
 *
 * Потом то же попросили для всех участников (VED-97): мастер «Свой рилс»
 * начинался с набора цитаты текстом, а у открытки цитата уже на картинке —
 * человек перепечатывал её только затем, чтобы дойти до шага с файлом.
 * Владелец решил публиковать такие картинки сразу, без модерации.
 *
 * Пост публикуется сразу в обоих случаях. Воркер его не видит — стадия уже
 * `published`, — поэтому ни проверки текста, ни генерации не запускается.
 */
@Injectable()
export class MotivationPicturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: MotivationCategoriesService,
    private readonly generation: MotivationGenerationService,
    private readonly settings: MotivationSettingsService,
  ) {}

  /** Картинка от редакции — из админки. */
  async create(
    user: AccessTokenPayload,
    file: UploadedReelImage | undefined,
    body: unknown,
  ): Promise<MotivationPictureResult> {
    if (!isAdmin(user)) throw new ForbiddenException('Только администратор');
    return this.publish(user, file, body, 'editorial');
  }

  /**
   * Картинка участника — первым вариантом мастера «Свой рилс» (VED-97).
   *
   * Те же ворота, что у рилса: закрытый автор, выключенные рилсы участников
   * и дневной лимит. Лимит общий с рилсами — это один счётчик «своих
   * публикаций за день», иначе картинками его обходили бы без счёта.
   */
  async createOwn(
    user: AccessTokenPayload,
    file: UploadedReelImage | undefined,
    body: unknown,
  ): Promise<MotivationPictureResult> {
    const admin = isAdmin(user);
    const [settings, policy] = await Promise.all([
      this.settings.read(),
      this.prisma.motivationAuthorPolicy.findUnique({
        where: { userId: user.sub },
        select: { dailyLimit: true, blocked: true },
      }),
    ]);
    if (policy?.blocked)
      throw new ForbiddenException(
        'Публикации для вашего аккаунта закрыты. Напишите в поддержку.',
      );
    if (!settings.userReelsEnabled && !admin)
      throw new ForbiddenException('Свои публикации сейчас выключены');
    if (!admin) {
      const dailyLimit = policy?.dailyLimit ?? settings.userDailyLimit;
      const used = await this.prisma.motivationPost.count({
        where: {
          authorUserId: user.sub,
          origin: 'user',
          createdAt: { gte: startOfUtcDay(new Date()) },
          reviewStatus: { not: 'rejected' },
        },
      });
      if (used >= dailyLimit)
        throw new ForbiddenException(
          dailyLimit === 0
            ? 'Свои публикации сейчас недоступны'
            : 'Лимит на сегодня исчерпан — следующую публикацию можно сделать завтра',
        );
    }
    return this.publish(user, file, body, 'user');
  }

  private async publish(
    user: AccessTokenPayload,
    file: UploadedReelImage | undefined,
    body: unknown,
    origin: 'editorial' | 'user',
  ): Promise<MotivationPictureResult> {
    const problem = validateReelImage(file);
    if (problem) throw new BadRequestException(reelImageMessage(problem));
    const input = normalizePictureInput(body);
    if (typeof input === 'string')
      throw new BadRequestException(pictureInputMessage(input));

    // Неизвестный слаг — ошибка, а не молчаливая категория по умолчанию:
    // картинка, которую несли в «Шастры», не должна тихо осесть в другом месте.
    const category = await this.categories.resolveSlug(
      input.category,
      'cards',
    );
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
        ...this.originFields(user, origin),
        authorUserId: user.sub,
        imageSource: 'uploaded',
        captionInImage: true,
        // Подпись для Stories не накладываем: она уже на картинке.
        storyCaption: false,
        attributionKind: 'exact_quote',
        attributionSpeaker: input.author || null,
        attributionWork: input.work || null,
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
        action: origin === 'editorial' ? 'admin_picture' : 'user_picture',
        reason: null,
        metadata: { category },
      },
    });

    return { postId: post.id, slug: post.slug, category, imageUrl };
  }

  /**
   * Чем картинка участника отличается от редакционной — только происхождением.
   *
   * `origin: 'user'` оставляет её во вкладке «Мои» и в аналитике публикаций
   * участников. Источник у неё не сверен — проверять печатную надпись нечем,
   * — а в общую ленту её пускает `captionInImage` (см. `READER_VISIBLE_POSTS`):
   * так решил владелец для готовых картинок.
   */
  private originFields(user: AccessTokenPayload, origin: 'editorial' | 'user') {
    return origin === 'editorial'
      ? { origin: 'editorial' as const, sourceVerified: true }
      : {
          origin: 'user' as const,
          sourceVerified: false,
          authorIsAdmin: isAdmin(user),
        };
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
    const sizeProblem = validateReelImageSize(meta);
    if (sizeProblem)
      throw new BadRequestException(reelImageSizeMessage(sizeProblem, meta));

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
