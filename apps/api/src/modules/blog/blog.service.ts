import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BLOG_MAX_POSTS_PER_DAY,
  resolveDisplayName,
  type BlogAuthorDto,
  type BlogAuthorFeedResponse,
  type BlogFavoriteResponse,
  type BlogLikeResponse,
  type BlogFeedResponse,
  type BlogHomeFeedResponse,
  type BlogImageRejection,
  type BlogPostCreatedResponse,
  type BlogPostDto,
  type BlogPostLinkDto,
  type BlogPostUpdatedResponse,
  type BlogSettingsDto,
  type CreateBlogPostRequest,
  type UpdateBlogPostRequest,
} from '@vedamatch/shared';
import type { BlogLinkPostInput } from './blog-link-post';
import { PrismaService } from '../../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { blogEditDenial, parseKeepImageIds, planBlogImages } from './blog-edit';
import {
  BLOG_PAGE_SIZE,
  blogCursorFilter,
  blogHomeTake,
  blogOrderBy,
  decodeBlogCursor,
  takeBlogPage,
} from './blog-feed-query';
import {
  BlogImagesService,
  type UploadedImageFile,
} from './blog-images.service';
import {
  blogVideoDurationDenial,
  blogVideoExtension,
  planBlogMedia,
} from './blog-media-rules';
import { BlogVideoService } from './blog-video.service';
import {
  clampFeedLifetimeHours,
  feedUntilFrom,
  isInFeed,
} from './blog-lifetime';
import {
  normalizeText,
  normalizeTitle,
  validateBlogPost,
} from './blog-validate';

const AUTHOR_SELECT = {
  id: true,
  name: true,
  // Контракт: рядом с именем наружу Prisma-select обязан тянуть духовное имя.
  spiritualName: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

const IMAGE_SELECT = {
  id: true,
  kind: true,
  url: true,
  width: true,
  height: true,
  posterUrl: true,
  durationSec: true,
} satisfies Prisma.BlogPostImageSelect;

const POST_SELECT_BASE = {
  id: true,
  authorId: true,
  title: true,
  text: true,
  feedUntil: true,
  pinned: true,
  repostCount: true,
  likeCount: true,
  createdAt: true,
  editedAt: true,
  // Нужен не карточке, а праву на правку: репост не правится никем.
  repostOfId: true,
  linkUrl: true,
  linkLabel: true,
  linkImageUrl: true,
  author: { select: AUTHOR_SELECT },
  images: { select: IMAGE_SELECT, orderBy: { position: 'asc' as const } },
  repostOf: {
    select: {
      id: true,
      title: true,
      text: true,
      createdAt: true,
      linkUrl: true,
      linkLabel: true,
      linkImageUrl: true,
      author: { select: AUTHOR_SELECT },
      images: { select: IMAGE_SELECT, orderBy: { position: 'asc' as const } },
    },
  },
} satisfies Prisma.BlogPostSelect;

/**
 * Выборка поста для конкретного зрителя: «в избранном ли» у каждого своё
 * (VED-238), поэтому связь фильтруется по нему и берётся не больше одной
 * строки — по первичному ключу (userId, postId) другой и не бывает.
 */
function postSelect(viewerId: string) {
  return {
    ...POST_SELECT_BASE,
    favorites: {
      where: { userId: viewerId },
      select: { userId: true },
      take: 1,
    },
    likes: {
      where: { userId: viewerId },
      select: { userId: true },
      take: 1,
    },
  } satisfies Prisma.BlogPostSelect;
}

type PostRow = Prisma.BlogPostGetPayload<{
  select: ReturnType<typeof postSelect>;
}>;
type MediaRow = PostRow['images'][number];
type AuthorRow = Prisma.UserGetPayload<{ select: typeof AUTHOR_SELECT }>;

/** Кто смотрит ленту: id, права и список скрытых от него людей. */
interface Viewer {
  userId: string;
  isAdmin: boolean;
  hiddenUserIds: Set<string>;
}

@Injectable()
export class BlogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly images: BlogImagesService,
    private readonly video: BlogVideoService,
  ) {}

  /**
   * Виджет главной: первые посты текущей ленты и сколько их всего.
   *
   * Отдельный метод, а не `feed({ limit })`: виджету нужен ровно счётчик
   * «и ещё N», а полной ленте — курсор, и смешивать их в одном ответе
   * значит гонять лишний `count` на каждой странице архива.
   */
  async home(
    userId: string,
    viewerIsAdmin: boolean,
    view?: string,
  ): Promise<BlogHomeFeedResponse> {
    const viewer = await this.viewer(userId, viewerIsAdmin);
    const now = new Date();
    const where = this.feedWhere(viewer, now, true);

    const [rows, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        select: postSelect(viewer.userId),
        orderBy: blogOrderBy(),
        take: blogHomeTake(view),
      }),
      this.prisma.blogPost.count({ where }),
    ]);

    return { posts: rows.map((row) => toPostDto(row, viewer, now)), total };
  }

  /**
   * Лента сервиса. `scope: 'current'` — то же, что на главной; `'all'` —
   * архив: все прошлые посты, включая вышедшие из ленты по сроку. Именно
   * архив открывается нажатием на виджет (VED-238).
   */
  async feed(
    userId: string,
    viewerIsAdmin: boolean,
    params: { scope?: string; cursor?: string },
  ): Promise<BlogFeedResponse> {
    const viewer = await this.viewer(userId, viewerIsAdmin);
    const now = new Date();
    const currentOnly = params.scope !== 'all';
    const base = this.feedWhere(viewer, now, currentOnly);

    const cursor = decodeBlogCursor(params.cursor);
    const where: Prisma.BlogPostWhereInput = cursor
      ? { AND: [base, blogCursorFilter(cursor)] }
      : base;

    const rows = await this.prisma.blogPost.findMany({
      where,
      select: postSelect(viewer.userId),
      orderBy: blogOrderBy(),
      take: BLOG_PAGE_SIZE + 1,
    });

    const page = takeBlogPage(rows);
    return {
      posts: page.items.map((row) => toPostDto(row, viewer, now)),
      nextCursor: page.nextCursor,
    };
  }

  /**
   * Личный блог участника (VED-116): те же посты, отфильтрованные по автору.
   * Здесь показывается всё, что человек написал, без учёта срока: блог — это
   * архив автора, а срок управляет только общей лентой.
   */
  async authorFeed(
    userId: string,
    viewerIsAdmin: boolean,
    authorId: string,
    cursor?: string,
  ): Promise<BlogAuthorFeedResponse> {
    const viewer = await this.viewer(userId, viewerIsAdmin);
    const now = new Date();

    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: AUTHOR_SELECT,
    });
    if (!author) throw new NotFoundException('author_not_found');
    // Скрытый человек и его блог не должны попадаться зрителю нигде — ровно
    // тот же ответ, что и у несуществующего автора.
    if (viewer.hiddenUserIds.has(authorId) && authorId !== viewer.userId) {
      throw new NotFoundException('author_not_found');
    }

    const base: Prisma.BlogPostWhereInput = { authorId };
    const decoded = decodeBlogCursor(cursor);
    const where: Prisma.BlogPostWhereInput = decoded
      ? { AND: [base, blogCursorFilter(decoded)] }
      : base;

    const [rows, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        select: postSelect(viewer.userId),
        orderBy: blogOrderBy(),
        take: BLOG_PAGE_SIZE + 1,
      }),
      this.prisma.blogPost.count({ where: base }),
    ]);

    const page = takeBlogPage(rows);
    return {
      author: toAuthorDto(author),
      posts: page.items.map((row) => toPostDto(row, viewer, now)),
      nextCursor: page.nextCursor,
      total,
    };
  }

  async post(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
  ): Promise<BlogPostDto> {
    const viewer = await this.viewer(userId, viewerIsAdmin);
    const row = await this.prisma.blogPost.findUnique({
      where: { id },
      select: postSelect(viewer.userId),
    });
    if (!row) throw new NotFoundException('post_not_found');
    if (viewer.hiddenUserIds.has(row.authorId) && row.authorId !== userId) {
      throw new NotFoundException('post_not_found');
    }
    return toPostDto(row, viewer, new Date());
  }

  /**
   * Публикация. Картинки приезжают тем же запросом: пост без слов, но с
   * фотографией — законный пост картиночной ленты, и создавать ради него
   * пустой черновик, чтобы дослать файлы вторым запросом, значит оставлять
   * в общей ленте пустые карточки при каждой оборванной загрузке.
   *
   * Срок жизни в ленте берётся из настроек сервиса и записывается в пост:
   * участник им не управляет — он «постит один за другим» (VED-238).
   */
  async create(
    userId: string,
    viewerIsAdmin: boolean,
    body: CreateBlogPostRequest,
    files: UploadedImageFile[] = [],
  ): Promise<BlogPostCreatedResponse> {
    const title = normalizeTitle(body?.title);
    const text = normalizeText(body?.text);
    const error = validateBlogPost({
      title,
      text,
      imageCount: files.length,
    });
    if (error) throw new BadRequestException(error);
    if (files.length > 0 && !this.images.configured) {
      throw new BadRequestException('image_upload_unavailable');
    }

    await this.assertDailyLimit(userId);

    const now = new Date();
    const settings = await this.settingsRow();
    const created = await this.prisma.blogPost.create({
      data: {
        authorId: userId,
        title,
        text,
        feedUntil: feedUntilFrom(now, settings.feedLifetimeHours),
      },
      select: { id: true },
    });

    const failed = await this.storeMedia(created.id, files);

    // Все картинки отвалились, а слов в посте нет — в ленту уехала бы пустая
    // карточка. Убираем черновик и честно говорим, почему не вышло.
    if (title === null && text === '' && failed.length === files.length) {
      await this.prisma.blogPost.delete({ where: { id: created.id } });
      throw new BadRequestException(failed[0]?.reason ?? 'post_empty');
    }

    const row = await this.prisma.blogPost.findUniqueOrThrow({
      where: { id: created.id },
      select: postSelect(userId),
    });
    const viewer: Viewer = {
      userId,
      isAdmin: viewerIsAdmin,
      hiddenUserIds: new Set(),
    };
    return { post: toPostDto(row, viewer, now), failed };
  }

  /**
   * Правка поста (VED-321): и слова, и фотографии одним запросом.
   *
   * Правит автор, а любой пост — администратор. Право считается на сервере:
   * спрятанной кнопки мало, PATCH чужого поста обязан отлупаться 403.
   *
   * Картинки описываются списком оставленных, а новые едут файлами в том же
   * multipart — ровно как при публикации, чтобы «поправить» не превращалось
   * в «удалить и опубликовать заново».
   */
  async update(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    body: UpdateBlogPostRequest,
    files: UploadedImageFile[] = [],
  ): Promise<BlogPostUpdatedResponse> {
    const row = await this.prisma.blogPost.findUnique({
      where: { id },
      select: {
        authorId: true,
        repostOfId: true,
        images: {
          select: {
            id: true,
            kind: true,
            storageKey: true,
            posterKey: true,
            position: true,
          },
          orderBy: { position: 'asc' },
        },
      },
    });
    if (!row) throw new NotFoundException('post_not_found');

    const denial = blogEditDenial(row, { userId, isAdmin: viewerIsAdmin });
    // Репост не правится вовсе — это не «не хватило прав», а свойство
    // карточки, поэтому 400, а не 403: правами тут ничего не изменить.
    if (denial === 'repost_not_editable') throw new BadRequestException(denial);
    if (denial) throw new ForbiddenException(denial);

    const title = normalizeTitle(body?.title);
    const text = normalizeText(body?.text);
    const plan = planBlogImages(
      row.images,
      parseKeepImageIds(body?.keepImageIds),
    );
    const error = validateBlogPost({
      title,
      text,
      imageCount: plan.kept.length + files.length,
    });
    if (error) throw new BadRequestException(error);
    if (files.length > 0 && !this.images.configured) {
      throw new BadRequestException('image_upload_unavailable');
    }

    // Файлы кладём до записи в пост: если ни один не доехал, а слов и старых
    // картинок не осталось, правка оставила бы в ленте пустую карточку —
    // здесь её ещё можно не применять вовсе, а не удалять пост следом.
    const failed = await this.storeMedia(id, files, {
      total: plan.kept.length,
      videos: plan.kept.filter((item) => item.kind === 'video').length,
    });
    const arrived = files.length - failed.length;
    if (
      title === null &&
      text === '' &&
      plan.kept.length === 0 &&
      arrived === 0
    ) {
      throw new BadRequestException(failed[0]?.reason ?? 'post_empty');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (plan.removed.length > 0) {
        await tx.blogPostImage.deleteMany({
          where: { id: { in: plan.removed.map((image) => image.id) } },
        });
      }
      // Перестановка на экране доезжает до ленты, а объекты в бакете при
      // этом не переписываются: порядок живёт полем.
      for (const [index, image] of plan.kept.entries()) {
        if (image.position === index) continue;
        await tx.blogPostImage.update({
          where: { id: image.id },
          data: { position: index },
        });
      }
      await tx.blogPost.update({
        where: { id },
        data: { title, text, editedAt: now },
      });
    });

    await this.images.removeMany(mediaKeys(plan.removed));

    const updated = await this.prisma.blogPost.findUniqueOrThrow({
      where: { id },
      select: postSelect(userId),
    });
    const viewer = await this.viewer(userId, viewerIsAdmin);
    return { post: toPostDto(updated, viewer, now), failed };
  }

  /**
   * Репост: новый пост со ссылкой на исходный. Репост репоста поднимается
   * до оригинала — иначе в ленте вырастает матрёшка из пустых карточек.
   */
  async repost(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    body: CreateBlogPostRequest | undefined,
  ): Promise<BlogPostDto> {
    const source = await this.prisma.blogPost.findUnique({
      where: { id },
      select: { id: true, authorId: true, repostOfId: true },
    });
    if (!source) throw new NotFoundException('post_not_found');

    const viewer = await this.viewer(userId, viewerIsAdmin);
    if (viewer.hiddenUserIds.has(source.authorId)) {
      throw new NotFoundException('post_not_found');
    }

    const rootId = source.repostOfId ?? source.id;
    const title = normalizeTitle(body?.title);
    const text = normalizeText(body?.text);
    const error = validateBlogPost({
      title,
      text,
      imageCount: 0,
      isRepost: true,
    });
    if (error) throw new BadRequestException(error);

    await this.assertDailyLimit(userId);

    const now = new Date();
    const settings = await this.settingsRow();
    const [row] = await this.prisma.$transaction([
      this.prisma.blogPost.create({
        data: {
          authorId: userId,
          title,
          text,
          repostOfId: rootId,
          feedUntil: feedUntilFrom(now, settings.feedLifetimeHours),
        },
        select: postSelect(viewer.userId),
      }),
      this.prisma.blogPost.update({
        where: { id: rootId },
        data: { repostCount: { increment: 1 } },
      }),
    ]);

    return toPostDto(row, viewer, now);
  }

  /** Удаляет автор или администратор. Картинки уходят из бакета следом. */
  async remove(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
  ): Promise<void> {
    const row = await this.prisma.blogPost.findUnique({
      where: { id },
      select: {
        authorId: true,
        repostOfId: true,
        images: { select: { storageKey: true, posterKey: true } },
      },
    });
    if (!row) throw new NotFoundException('post_not_found');
    if (row.authorId !== userId && !viewerIsAdmin) {
      throw new ForbiddenException('not_your_post');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.blogPost.delete({ where: { id } });
      if (row.repostOfId) {
        // Счётчик денормализован, поэтому его чинит тот, кто удаляет строку.
        await tx.blogPost.updateMany({
          where: { id: row.repostOfId, repostCount: { gt: 0 } },
          data: { repostCount: { decrement: 1 } },
        });
      }
    });

    await this.images.removeMany(mediaKeys(row.images));
  }

  /**
   * Кладёт файлы в хранилище и заводит строки вложений — фото и роликов
   * (VED-116). Один плохой файл не должен терять уже загруженные хорошие:
   * копим отказы, а не бросаем на первом.
   *
   * `existing` — что уже лежит в посте при правке: предел вложений считается
   * по всему посту, а не по добавке, и нумерация продолжает оставленные.
   */
  private async storeMedia(
    postId: string,
    files: UploadedImageFile[],
    existing: { total: number; videos: number } = { total: 0, videos: 0 },
  ): Promise<BlogImageRejection[]> {
    const failed: BlogImageRejection[] = [];
    let position = existing.total;

    for (const decision of planBlogMedia(files, existing)) {
      const name = decision.file.originalname ?? 'файл';
      if ('denial' in decision) {
        failed.push({ name, reason: decision.denial });
        continue;
      }
      const reason =
        decision.kind === 'video'
          ? await this.storeVideo(postId, decision.file, position)
          : await this.storePhoto(postId, decision.file, position);
      if (reason) {
        failed.push({ name, reason });
        continue;
      }
      position += 1;
    }

    return failed;
  }

  /** `null` — фото легло в пост; иначе код отказа. */
  private async storePhoto(
    postId: string,
    file: UploadedImageFile,
    position: number,
  ): Promise<string | null> {
    const stored = await this.images
      .storePostImage(postId, file)
      .catch(() => null);
    if (!stored) return 'processing_failed';
    await this.prisma.blogPostImage.create({
      data: {
        postId,
        kind: 'photo',
        storageKey: stored.key,
        url: stored.url,
        width: stored.width,
        height: stored.height,
        sizeBytes: stored.sizeBytes,
        position,
      },
    });
    return null;
  }

  /**
   * Ролик: сначала разбор (обложка и длительность), потом бакет. Порядок
   * важен — ролик длиннее предела не должен успеть занять место в хранилище.
   */
  private async storeVideo(
    postId: string,
    file: UploadedImageFile,
    position: number,
  ): Promise<string | null> {
    const extension = blogVideoExtension(file.mimetype);
    const inspected = await this.video.inspect(file.buffer, extension);
    if (!inspected) return 'video_unreadable';
    const tooLong = blogVideoDurationDenial(inspected.info.durationSec);
    if (tooLong) return tooLong;

    const stored = await this.images
      .storePostVideo(postId, file, inspected.poster, extension)
      .catch(() => null);
    if (!stored) return 'processing_failed';
    await this.prisma.blogPostImage.create({
      data: {
        postId,
        kind: 'video',
        storageKey: stored.key,
        url: stored.url,
        posterKey: stored.posterKey,
        posterUrl: stored.posterUrl,
        durationSec: inspected.info.durationSec,
        width: inspected.info.width,
        height: inspected.info.height,
        sizeBytes: stored.sizeBytes,
        position,
      },
    });
    return null;
  }

  // ---- «Нравится» (VED-505) --------------------------------------------

  /**
   * Поставить или снять «Нравится». Идемпотентно, как избранное: счётчик
   * меняется, только когда строка действительно появилась или исчезла.
   */
  async setLike(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    liked: boolean,
  ): Promise<BlogLikeResponse> {
    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      select: { authorId: true },
    });
    if (!post) throw new NotFoundException('post_not_found');

    if (liked) {
      const viewer = await this.viewer(userId, viewerIsAdmin);
      if (viewer.hiddenUserIds.has(post.authorId) && post.authorId !== userId) {
        throw new NotFoundException('post_not_found');
      }
    }

    const likeCount = await this.prisma.$transaction(async (tx) => {
      if (liked) {
        const created = await tx.blogLike.createMany({
          data: [{ userId, postId: id }],
          skipDuplicates: true,
        });
        if (created.count > 0) {
          const row = await tx.blogPost.update({
            where: { id },
            data: { likeCount: { increment: 1 } },
            select: { likeCount: true },
          });
          return row.likeCount;
        }
      } else {
        const removed = await tx.blogLike.deleteMany({
          where: { userId, postId: id },
        });
        if (removed.count > 0) {
          const row = await tx.blogPost.update({
            where: { id },
            data: { likeCount: { decrement: 1 } },
            select: { likeCount: true },
          });
          return Math.max(0, row.likeCount);
        }
      }
      const row = await tx.blogPost.findUniqueOrThrow({
        where: { id },
        select: { likeCount: true },
      });
      return row.likeCount;
    });
    return { liked, likeCount };
  }

  // ---- избранное (VED-238) ---------------------------------------------

  /**
   * Отметить пост звёздочкой или снять её. Идемпотентно в обе стороны:
   * двойное нажатие на медленной сети не должно отвечать ошибкой.
   */
  async setFavorite(
    userId: string,
    viewerIsAdmin: boolean,
    id: string,
    favorited: boolean,
  ): Promise<BlogFavoriteResponse> {
    if (!favorited) {
      await this.prisma.blogFavorite.deleteMany({
        where: { userId, postId: id },
      });
      return { favorited: false };
    }

    const post = await this.prisma.blogPost.findUnique({
      where: { id },
      select: { authorId: true },
    });
    if (!post) throw new NotFoundException('post_not_found');
    const viewer = await this.viewer(userId, viewerIsAdmin);
    if (viewer.hiddenUserIds.has(post.authorId) && post.authorId !== userId) {
      throw new NotFoundException('post_not_found');
    }

    await this.prisma.blogFavorite.upsert({
      where: { userId_postId: { userId, postId: id } },
      update: {},
      create: { userId, postId: id },
    });
    return { favorited: true };
  }

  /**
   * «Избранное» зрителя — те же посты и тот же порядок, что в ленте, только
   * отмеченные им. Срок в ленте здесь не действует: пост, ушедший с главной,
   * человек отметил как раз затем, чтобы к нему вернуться.
   */
  async favorites(
    userId: string,
    viewerIsAdmin: boolean,
    cursor?: string,
  ): Promise<BlogFeedResponse> {
    const viewer = await this.viewer(userId, viewerIsAdmin);
    const now = new Date();
    const base: Prisma.BlogPostWhereInput = {
      ...this.feedWhere(viewer, now, false),
      favorites: { some: { userId } },
    };
    const decoded = decodeBlogCursor(cursor);
    const where: Prisma.BlogPostWhereInput = decoded
      ? { AND: [base, blogCursorFilter(decoded)] }
      : base;

    const rows = await this.prisma.blogPost.findMany({
      where,
      select: postSelect(viewer.userId),
      orderBy: blogOrderBy(),
      take: BLOG_PAGE_SIZE + 1,
    });
    const page = takeBlogPage(rows);
    return {
      posts: page.items.map((row) => toPostDto(row, viewer, now)),
      nextCursor: page.nextCursor,
    };
  }

  // ---- администрирование (VED-238) --------------------------------------

  async settings(): Promise<BlogSettingsDto> {
    const row = await this.settingsRow();
    return { feedLifetimeHours: row.feedLifetimeHours };
  }

  async updateSettings(hours: unknown): Promise<BlogSettingsDto> {
    const feedLifetimeHours = clampFeedLifetimeHours(hours);
    await this.prisma.blogSettings.upsert({
      where: { id: 'global' },
      update: { feedLifetimeHours },
      create: { id: 'global', feedLifetimeHours },
    });
    return { feedLifetimeHours };
  }

  /**
   * Срок конкретного поста. Считается от публикации, а не от «сейчас»:
   * админ отвечает на вопрос «сколько этот пост висит в ленте», а не
   * «сколько ему осталось».
   */
  async setLifetime(
    userId: string,
    id: string,
    hours: unknown,
  ): Promise<BlogPostDto> {
    const row = await this.prisma.blogPost.findUnique({
      where: { id },
      select: { createdAt: true },
    });
    if (!row) throw new NotFoundException('post_not_found');

    const feedUntil =
      hours === null ? null : feedUntilFrom(row.createdAt, Number(hours));
    const updated = await this.prisma.blogPost.update({
      where: { id },
      data: { feedUntil },
      select: postSelect(userId),
    });
    const viewer: Viewer = {
      userId,
      isAdmin: true,
      hiddenUserIds: new Set(),
    };
    return toPostDto(updated, viewer, new Date());
  }

  async setPinned(
    userId: string,
    id: string,
    pinned: boolean,
  ): Promise<BlogPostDto> {
    const exists = await this.prisma.blogPost.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('post_not_found');

    const updated = await this.prisma.blogPost.update({
      where: { id },
      data: { pinned: Boolean(pinned) },
      select: postSelect(userId),
    });
    const viewer: Viewer = { userId, isAdmin: true, hiddenUserIds: new Set() };
    return toPostDto(updated, viewer, new Date());
  }

  // ---- внутреннее -------------------------------------------------------

  private async viewer(userId: string, isAdmin: boolean): Promise<Viewer> {
    // Скоуп `all`: своего скоупа скрытий у ленты нет, блокировка портала
    // обязана действовать и здесь.
    const hiddenUserIds = await this.moderation.hiddenUserIds(userId, 'all');
    return { userId, isAdmin, hiddenUserIds };
  }

  private feedWhere(
    viewer: Viewer,
    now: Date,
    currentOnly: boolean,
  ): Prisma.BlogPostWhereInput {
    const where: Prisma.BlogPostWhereInput = {};
    if (currentOnly) {
      where.OR = [{ feedUntil: null }, { feedUntil: { gt: now } }];
    }
    if (viewer.hiddenUserIds.size > 0) {
      where.authorId = { notIn: [...viewer.hiddenUserIds] };
    }
    return where;
  }

  private async settingsRow(): Promise<{ feedLifetimeHours: number }> {
    const row = await this.prisma.blogSettings.findUnique({
      where: { id: 'global' },
      select: { feedLifetimeHours: true },
    });
    if (row) return row;
    return this.prisma.blogSettings.create({
      data: { id: 'global' },
      select: { feedLifetimeHours: true },
    });
  }

  /**
   * «Постить один за другим» — не значит «сколько угодно за минуту».
   * Суточный предел тот же, что у Моментов: спам в общей ленте портала
   * виден всем сразу.
   */
  /**
   * Пост из материала другого сервиса (VED-490). Тот же суточный предел,
   * что у обычной публикации: кнопка «В Блог-ленту» — не обход лимита.
   */
  async createLinked(
    userId: string,
    input: BlogLinkPostInput,
  ): Promise<string> {
    await this.assertDailyLimit(userId);
    const settings = await this.settingsRow();
    const created = await this.prisma.blogPost.create({
      data: {
        authorId: userId,
        title: input.title,
        text: input.text,
        linkUrl: input.linkUrl,
        linkLabel: input.linkLabel,
        linkImageUrl: input.linkImageUrl,
        feedUntil: feedUntilFrom(new Date(), settings.feedLifetimeHours),
      },
      select: { id: true },
    });
    return created.id;
  }

  private async assertDailyLimit(userId: string): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const posted = await this.prisma.blogPost.count({
      where: { authorId: userId, createdAt: { gte: since } },
    });
    if (posted >= BLOG_MAX_POSTS_PER_DAY) {
      throw new BadRequestException('daily_limit_reached');
    }
  }
}

/** Все объекты вложений в бакете: у ролика их два — файл и обложка. */
function mediaKeys(
  rows: Array<{ storageKey: string; posterKey: string | null }>,
): string[] {
  return rows.flatMap((row) =>
    row.posterKey ? [row.storageKey, row.posterKey] : [row.storageKey],
  );
}

function toAuthorDto(author: AuthorRow): BlogAuthorDto {
  return {
    id: author.id,
    name: resolveDisplayName(author),
    avatarUrl: author.avatarUrl,
  };
}

/**
 * `images` — только фото, для приложения, которое о роликах ещё не знает;
 * `media` — всё в порядке карусели (VED-116).
 */
function toMedia(rows: MediaRow[]): Pick<BlogPostDto, 'images' | 'media'> {
  return {
    images: rows
      .filter((item) => item.kind === 'photo')
      .map(({ id, url, width, height }) => ({ id, url, width, height })),
    media: rows.map((item) => ({
      id: item.id,
      kind: item.kind,
      url: item.url,
      width: item.width,
      height: item.height,
      posterUrl: item.posterUrl,
      durationSec: item.durationSec,
    })),
  };
}

/** Ссылка на материал другого сервиса (VED-490); без адреса — нет ссылки. */
function toLinkDto(row: {
  linkUrl: string | null;
  linkLabel: string | null;
  linkImageUrl: string | null;
}): BlogPostLinkDto | null {
  if (!row.linkUrl) return null;
  return {
    url: row.linkUrl,
    label: row.linkLabel ?? '',
    imageUrl: row.linkImageUrl,
  };
}

function toPostDto(row: PostRow, viewer: Viewer, now: Date): BlogPostDto {
  return {
    id: row.id,
    author: toAuthorDto(row.author),
    title: row.title,
    text: row.text,
    ...toMedia(row.images),
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    feedUntil: row.feedUntil ? row.feedUntil.toISOString() : null,
    inFeed: isInFeed(row.feedUntil, now),
    pinned: row.pinned,
    repostCount: row.repostCount,
    repostOf: row.repostOf
      ? {
          id: row.repostOf.id,
          author: toAuthorDto(row.repostOf.author),
          title: row.repostOf.title,
          text: row.repostOf.text,
          ...toMedia(row.repostOf.images),
          createdAt: row.repostOf.createdAt.toISOString(),
          link: toLinkDto(row.repostOf),
        }
      : null,
    link: toLinkDto(row),
    // Ровно то же правило, по которому отлупается PATCH: кнопка на экране и
    // проверка на сервере не имеют права разойтись.
    canEdit:
      blogEditDenial(row, {
        userId: viewer.userId,
        isAdmin: viewer.isAdmin,
      }) === null,
    canManage: row.authorId === viewer.userId || viewer.isAdmin,
    canModerate: viewer.isAdmin,
    favorited: row.favorites.length > 0,
    liked: row.likes.length > 0,
    likeCount: row.likeCount,
  };
}
