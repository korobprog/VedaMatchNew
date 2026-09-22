import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BLOG_HOME_PREVIEW_SIZE,
  BLOG_MAX_POSTS_PER_DAY,
  BLOG_POST_MAX_IMAGES,
  resolveDisplayName,
  type BlogAuthorDto,
  type BlogAuthorFeedResponse,
  type BlogFeedResponse,
  type BlogHomeFeedResponse,
  type BlogImageRejection,
  type BlogPostCreatedResponse,
  type BlogPostDto,
  type BlogSettingsDto,
  type CreateBlogPostRequest,
} from '@vedamatch/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import {
  BLOG_PAGE_SIZE,
  blogCursorFilter,
  blogOrderBy,
  decodeBlogCursor,
  takeBlogPage,
} from './blog-feed-query';
import {
  BlogImagesService,
  type StoredImage,
  type UploadedImageFile,
} from './blog-images.service';
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
  url: true,
  width: true,
  height: true,
} satisfies Prisma.BlogPostImageSelect;

const POST_SELECT = {
  id: true,
  authorId: true,
  title: true,
  text: true,
  feedUntil: true,
  pinned: true,
  repostCount: true,
  createdAt: true,
  author: { select: AUTHOR_SELECT },
  images: { select: IMAGE_SELECT, orderBy: { position: 'asc' as const } },
  repostOf: {
    select: {
      id: true,
      title: true,
      text: true,
      createdAt: true,
      author: { select: AUTHOR_SELECT },
      images: { select: IMAGE_SELECT, orderBy: { position: 'asc' as const } },
    },
  },
} satisfies Prisma.BlogPostSelect;

type PostRow = Prisma.BlogPostGetPayload<{ select: typeof POST_SELECT }>;
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
  ): Promise<BlogHomeFeedResponse> {
    const viewer = await this.viewer(userId, viewerIsAdmin);
    const now = new Date();
    const where = this.feedWhere(viewer, now, true);

    const [rows, total] = await Promise.all([
      this.prisma.blogPost.findMany({
        where,
        select: POST_SELECT,
        orderBy: blogOrderBy(),
        take: BLOG_HOME_PREVIEW_SIZE,
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
      select: POST_SELECT,
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
        select: POST_SELECT,
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
      select: POST_SELECT,
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

    const failed = await this.storeImages(created.id, files);

    // Все картинки отвалились, а слов в посте нет — в ленту уехала бы пустая
    // карточка. Убираем черновик и честно говорим, почему не вышло.
    if (title === null && text === '' && failed.length === files.length) {
      await this.prisma.blogPost.delete({ where: { id: created.id } });
      throw new BadRequestException(failed[0]?.reason ?? 'post_empty');
    }

    const row = await this.prisma.blogPost.findUniqueOrThrow({
      where: { id: created.id },
      select: POST_SELECT,
    });
    const viewer: Viewer = {
      userId,
      isAdmin: viewerIsAdmin,
      hiddenUserIds: new Set(),
    };
    return { post: toPostDto(row, viewer, now), failed };
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
        select: POST_SELECT,
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
        images: { select: { storageKey: true } },
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

    await this.images.removeMany(row.images.map((image) => image.storageKey));
  }

  /**
   * Кладёт файлы в хранилище и заводит строки картинок. Один плохой файл не
   * должен терять уже загруженные хорошие: копим отказы, а не бросаем на
   * первом.
   */
  private async storeImages(
    postId: string,
    files: UploadedImageFile[],
  ): Promise<BlogImageRejection[]> {
    const failed: BlogImageRejection[] = [];
    let position = 0;

    for (const file of files) {
      const name = file.originalname ?? 'файл';
      if (position >= BLOG_POST_MAX_IMAGES) {
        failed.push({ name, reason: 'too_many_images' });
        continue;
      }
      const invalid = this.images.validate(file);
      if (invalid) {
        failed.push({ name, reason: invalid });
        continue;
      }
      let stored: StoredImage | null;
      try {
        stored = await this.images.storePostImage(postId, file);
      } catch {
        stored = null;
      }
      if (!stored) {
        failed.push({ name, reason: 'processing_failed' });
        continue;
      }
      await this.prisma.blogPostImage.create({
        data: {
          postId,
          storageKey: stored.key,
          url: stored.url,
          width: stored.width,
          height: stored.height,
          sizeBytes: stored.sizeBytes,
          position,
        },
      });
      position += 1;
    }

    return failed;
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
      select: POST_SELECT,
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
      select: POST_SELECT,
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

function toAuthorDto(author: AuthorRow): BlogAuthorDto {
  return {
    id: author.id,
    name: resolveDisplayName(author),
    avatarUrl: author.avatarUrl,
  };
}

function toPostDto(row: PostRow, viewer: Viewer, now: Date): BlogPostDto {
  return {
    id: row.id,
    author: toAuthorDto(row.author),
    title: row.title,
    text: row.text,
    images: row.images,
    createdAt: row.createdAt.toISOString(),
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
          images: row.repostOf.images,
          createdAt: row.repostOf.createdAt.toISOString(),
        }
      : null,
    canManage: row.authorId === viewer.userId || viewer.isAdmin,
    canModerate: viewer.isAdmin,
  };
}
