import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { BlogAvatarService } from './blog-avatar.service';
import { BlogService } from './blog.service';
import type { BlogImagesService } from './blog-images.service';
import type { BlogVideoService } from './blog-video.service';
import type { ModerationService } from '../moderation/moderation.service';
import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Права на правку поста (VED-321) — на сервере, а не прятанием кнопки.
 *
 * Заглушка Prisma без заранее навязанного типа результата: строгий
 * TypeScript иначе выводит тип по первой реализации, и следующий
 * mockResolvedValue в тесте перестаёт компилироваться.
 */
function fn(impl?: (...args: never[]) => unknown): jest.Mock {
  return jest.fn(impl as never);
}

const author = {
  id: 'author',
  name: 'Автор',
  spiritualName: null,
  avatarUrl: null,
};

function storedPost(over: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    authorId: 'author',
    repostOfId: null,
    title: 'Заголовок',
    text: 'Текст',
    feedUntil: null,
    pinned: false,
    repostCount: 0,
    likeCount: 0,
    createdAt: new Date('2026-09-21T10:00:00.000Z'),
    editedAt: null,
    author,
    images: [],
    favorites: [],
    likes: [],
    repostOf: null,
    ...over,
  };
}

function build(post: ReturnType<typeof storedPost> | null) {
  const prisma = {
    blogPost: {
      findUnique: fn(() => Promise.resolve(post)),
      findUniqueOrThrow: fn(() =>
        Promise.resolve(storedPost({ editedAt: new Date(), text: 'Новый' })),
      ),
      update: fn(() => Promise.resolve(post)),
    },
    // Зритель без самоидентификации — фильтра ступеней нет (VED-590).
    user: {
      findUnique: fn(() => Promise.resolve(null)),
    },
    blogPostImage: {
      deleteMany: fn(() => Promise.resolve({ count: 0 })),
      update: fn(() => Promise.resolve({})),
    },
    $transaction: fn((run: unknown) =>
      (run as (tx: unknown) => Promise<unknown>)(prisma),
    ),
  };
  const moderation = {
    hiddenUserIds: fn(() => Promise.resolve(new Set<string>())),
  };
  const images = {
    configured: true,
    removeMany: fn(() => Promise.resolve()),
    storePostImage: fn(() =>
      Promise.resolve({
        key: 'blog/post-1/new.webp',
        url: 'https://cdn/new.webp',
        width: 800,
        height: 600,
        sizeBytes: 1000,
      }),
    ),
    storePostVideo: fn(() =>
      Promise.resolve({
        key: 'blog/post-1/v.mp4',
        url: 'https://cdn/v.mp4',
        posterKey: 'blog/post-1/v.webp',
        posterUrl: 'https://cdn/v.webp',
        sizeBytes: 5000,
      }),
    ),
  };
  const video = {
    inspect: fn(() =>
      Promise.resolve({
        info: { durationSec: 12, width: 720, height: 1280 },
        poster: Buffer.from('poster'),
      }),
    ),
  };
  const avatars = {
    resolveAvatarUrl: fn((user: { avatarKey: string | null }) =>
      Promise.resolve(`https://signed/${user.avatarKey}`),
    ),
  };
  const events = { emit: fn() };
  const service = new BlogService(
    prisma as unknown as PrismaService,
    moderation as unknown as ModerationService,
    images as unknown as BlogImagesService,
    video as unknown as BlogVideoService,
    avatars as unknown as BlogAvatarService,
    events as unknown as EventEmitter2,
  );
  return { service, prisma, images, video, avatars, events };
}

describe('BlogService.update', () => {
  it('refuses a stranger who is not an admin with 403', async () => {
    const { service, prisma } = build(storedPost());

    await expect(
      service.update('someone', false, 'post-1', { text: 'Подменю' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update('someone', false, 'post-1', { text: 'Подменю' }),
    ).rejects.toMatchObject({ message: 'not_your_post' });
    // Отказ до единой записи: чужой пост не должен получить ни правки
    // текста, ни потери картинок.
    expect(prisma.blogPost.update).not.toHaveBeenCalled();
    expect(prisma.blogPostImage.deleteMany).not.toHaveBeenCalled();
  });

  it('lets the author edit their own post', async () => {
    const { service, prisma } = build(storedPost());

    const result = await service.update('author', false, 'post-1', {
      text: 'Новый',
    });

    expect(result.post.id).toBe('post-1');
    expect(result.post.editedAt).not.toBeNull();
    const [args] = prisma.blogPost.update.mock.calls[0] as [
      { where: { id: string }; data: { text: string; editedAt: Date } },
    ];
    expect(args.where.id).toBe('post-1');
    expect(args.data.text).toBe('Новый');
    // Отметка о правке ставится здесь же, а не оставляется на `updatedAt`.
    expect(args.data.editedAt).toBeInstanceOf(Date);
  });

  it('lets an admin edit a post of somebody else', async () => {
    const { service, prisma } = build(storedPost());

    await service.update('admin', true, 'post-1', { text: 'Новый' });

    expect(prisma.blogPost.update).toHaveBeenCalled();
  });

  // Репост показывает живой оригинал: правится он, а не карточка репоста.
  it('refuses a repost', async () => {
    const { service } = build(storedPost({ repostOfId: 'source' }));

    await expect(
      service.update('author', false, 'post-1', { text: 'Новый' }),
    ).rejects.toMatchObject({ message: 'repost_not_editable' });
    await expect(
      service.update('admin', true, 'post-1', { text: 'Новый' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 404 for a post that is gone', async () => {
    const { service } = build(null);

    await expect(
      service.update('author', false, 'post-1', { text: 'Новый' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // Пустая карточка в общей ленте хуже, чем отказ в правке.
  it('refuses an edit that would empty the post', async () => {
    const { service } = build(storedPost({ title: null }));

    await expect(
      service.update('author', false, 'post-1', { text: '   ' }),
    ).rejects.toMatchObject({ message: 'post_empty' });
  });

  // Правка одного текста не имеет права унести фотографии молча.
  it('leaves the images alone when the request says nothing about them', async () => {
    const { service, prisma, images } = build(
      storedPost({
        images: [
          {
            id: 'img-1',
            kind: 'photo',
            storageKey: 'blog/1.webp',
            posterKey: null,
            position: 0,
          },
        ],
      }),
    );

    await service.update('author', false, 'post-1', { text: 'Новый' });

    expect(prisma.blogPostImage.deleteMany).not.toHaveBeenCalled();
    expect(images.removeMany).toHaveBeenCalledWith([]);
  });

  it('drops the images the author did not keep and cleans the bucket', async () => {
    const { service, prisma, images } = build(
      storedPost({
        images: [
          {
            id: 'img-1',
            kind: 'video',
            storageKey: 'blog/1.mp4',
            posterKey: 'blog/1.webp',
            position: 0,
          },
          {
            id: 'img-2',
            kind: 'photo',
            storageKey: 'blog/2.webp',
            posterKey: null,
            position: 1,
          },
        ],
      }),
    );

    await service.update('author', false, 'post-1', {
      text: 'Новый',
      keepImageIds: ['img-2'],
    });

    expect(prisma.blogPostImage.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['img-1'] } },
    });
    // Оставшаяся картинка переезжает на нулевую позицию, объект в бакете при
    // этом не переписывается.
    expect(prisma.blogPostImage.update).toHaveBeenCalledWith({
      where: { id: 'img-2' },
      data: { position: 0 },
    });
    // У ролика в бакете два объекта — файл и обложка, уходят оба.
    expect(images.removeMany).toHaveBeenCalledWith([
      'blog/1.mp4',
      'blog/1.webp',
    ]);
  });

  // Роликов в посте не больше одного (VED-116): второй получает отказ, а
  // текст и прочее сохраняются.
  it('refuses a second video but keeps the edit', async () => {
    const { service, prisma, video } = build(
      storedPost({
        images: [
          {
            id: 'vid-1',
            kind: 'video',
            storageKey: 'blog/1.mp4',
            posterKey: 'blog/1.webp',
            position: 0,
          },
        ],
      }),
    );

    const result = await service.update(
      'author',
      false,
      'post-1',
      { text: 'Новый' },
      [
        {
          buffer: Buffer.from('x'),
          mimetype: 'video/mp4',
          size: 10,
          originalname: 'b.mp4',
        },
      ],
    );

    expect(result.failed).toEqual([
      { name: 'b.mp4', reason: 'too_many_videos' },
    ]);
    expect(video.inspect).not.toHaveBeenCalled();
    expect(prisma.blogPost.update).toHaveBeenCalled();
  });
});

/** Тело публикации с обязательными категорией и линией (VED-590). */
function marked(text: string) {
  return { text, category: 'news' as const, lineage: 'all' as const };
}

describe('BlogService media', () => {
  function withCreate(post = storedPost()) {
    const built = build(post);
    const prisma = built.prisma as unknown as Record<
      string,
      Record<string, jest.Mock>
    >;
    prisma.blogPost.create = fn(() => Promise.resolve({ id: 'post-1' }));
    prisma.blogPost.count = fn(() => Promise.resolve(0));
    prisma.blogPost.delete = fn(() => Promise.resolve({}));
    prisma.blogPostImage.create = fn(() => Promise.resolve({}));
    prisma.blogSettings = {
      findUnique: fn(() => Promise.resolve({ feedLifetimeHours: 72 })),
    };
    return { ...built, prisma };
  }

  // Длительность — замер сервера, а не число из браузера.
  it('stores a video with the poster and the measured duration', async () => {
    const { service, prisma, images } = withCreate();

    const result = await service.create('author', false, marked('Ролик'), [
      {
        buffer: Buffer.from('v'),
        mimetype: 'video/mp4',
        size: 100,
        originalname: 'a.mp4',
      },
    ]);

    expect(result.failed).toEqual([]);
    expect(images.storePostVideo).toHaveBeenCalledWith(
      'post-1',
      expect.objectContaining({ mimetype: 'video/mp4' }),
      Buffer.from('poster'),
      '.mp4',
    );
    const created = prisma.blogPostImage.create.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(created[0].data).toMatchObject({
      kind: 'video',
      posterUrl: 'https://cdn/v.webp',
      durationSec: 12,
      width: 720,
      height: 1280,
      position: 0,
    });
  });

  // Ролик длиннее предела не должен успеть лечь в бакет.
  it('refuses a video that is too long before uploading it', async () => {
    const { service, images, video } = withCreate();
    video.inspect.mockResolvedValue({
      info: { durationSec: 301, width: 720, height: 1280 },
      poster: Buffer.from('p'),
    });

    const result = await service.create('author', false, marked('Длинный'), [
      {
        buffer: Buffer.from('v'),
        mimetype: 'video/mp4',
        size: 100,
        originalname: 'long.mp4',
      },
    ]);

    expect(result.failed).toEqual([
      { name: 'long.mp4', reason: 'video_too_long' },
    ]);
    expect(images.storePostVideo).not.toHaveBeenCalled();
  });

  // Видео и фото — в одной карусели, фото прежним клиентам — отдельно.
  it('keeps photos in images and everything in media', async () => {
    const { service } = build(
      storedPost({
        images: [
          {
            id: 'v',
            kind: 'video',
            url: 'v.mp4',
            width: 1,
            height: 2,
            posterUrl: 'v.webp',
            durationSec: 5,
          },
          {
            id: 'p',
            kind: 'photo',
            url: 'p.webp',
            width: 3,
            height: 4,
            posterUrl: null,
            durationSec: null,
          },
        ],
        favorites: [{ userId: 'viewer' }],
      }),
    );

    const post = await service.post('viewer', false, 'post-1');

    expect(post.images).toEqual([
      { id: 'p', url: 'p.webp', width: 3, height: 4 },
    ]);
    expect(post.media.map((item) => item.kind)).toEqual(['video', 'photo']);
    expect(post.favorited).toBe(true);
  });
});

describe('BlogService likes (VED-505)', () => {
  function withLikes(created: number, removed: number, count: number) {
    const built = build(storedPost());
    const prisma = built.prisma as unknown as Record<
      string,
      Record<string, jest.Mock>
    >;
    prisma.blogLike = {
      createMany: fn(() => Promise.resolve({ count: created })),
      deleteMany: fn(() => Promise.resolve({ count: removed })),
    };
    prisma.blogPost.update = fn(() => Promise.resolve({ likeCount: count }));
    prisma.blogPost.findUniqueOrThrow = fn(() =>
      Promise.resolve({ likeCount: count }),
    );
    return { ...built, prisma };
  }

  it('likes once and bumps the counter', async () => {
    const { service, prisma } = withLikes(1, 0, 3);

    await expect(
      service.setLike('viewer', false, 'post-1', true),
    ).resolves.toEqual({ liked: true, likeCount: 3 });
    expect(prisma.blogLike.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'viewer', postId: 'post-1' }],
      skipDuplicates: true,
    });
    expect(prisma.blogPost.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { likeCount: { increment: 1 } },
      select: { likeCount: true },
    });
  });

  it('a second like leaves the counter alone', async () => {
    const { service, prisma } = withLikes(0, 0, 3);

    await expect(
      service.setLike('viewer', false, 'post-1', true),
    ).resolves.toEqual({ liked: true, likeCount: 3 });
    expect(prisma.blogPost.update).not.toHaveBeenCalled();
  });

  it('unlike decrements only when there was a like', async () => {
    const { service, prisma } = withLikes(0, 1, 2);

    await expect(
      service.setLike('viewer', false, 'post-1', false),
    ).resolves.toEqual({ liked: false, likeCount: 2 });
    expect(prisma.blogPost.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { likeCount: { decrement: 1 } },
      select: { likeCount: true },
    });
  });

  it('answers 404 for a missing post', async () => {
    const built = build(null);
    await expect(
      built.service.setLike('viewer', false, 'post-1', true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('BlogService avatars (VED-492)', () => {
  it('signs an uploaded author photo instead of an empty circle', async () => {
    const { service, avatars } = build(
      storedPost({
        author: { ...author, avatarUrl: null, avatarKey: 'avatars/a.webp' },
      }),
    );

    const post = await service.post('viewer', false, 'post-1');

    expect(post.author.avatarUrl).toBe('https://signed/avatars/a.webp');
    expect(avatars.resolveAvatarUrl).toHaveBeenCalledTimes(1);
  });

  it('keeps a public (Google) photo as is', async () => {
    const { service, avatars } = build(
      storedPost({
        author: { ...author, avatarUrl: 'https://g/p.jpg', avatarKey: null },
      }),
    );

    const post = await service.post('viewer', false, 'post-1');

    expect(post.author.avatarUrl).toBe('https://g/p.jpg');
    expect(avatars.resolveAvatarUrl).not.toHaveBeenCalled();
  });
});

describe('BlogService favorites', () => {
  function withFavorites(post: ReturnType<typeof storedPost> | null) {
    const built = build(post);
    const prisma = built.prisma as unknown as Record<
      string,
      Record<string, jest.Mock>
    >;
    prisma.blogFavorite = {
      upsert: fn(() => Promise.resolve({})),
      deleteMany: fn(() => Promise.resolve({ count: 1 })),
    };
    return { ...built, prisma };
  }

  it('adds and removes idempotently', async () => {
    const { service, prisma } = withFavorites(storedPost());

    await expect(
      service.setFavorite('viewer', false, 'post-1', true),
    ).resolves.toEqual({
      favorited: true,
    });
    expect(prisma.blogFavorite.upsert).toHaveBeenCalledWith({
      where: { userId_postId: { userId: 'viewer', postId: 'post-1' } },
      update: {},
      create: { userId: 'viewer', postId: 'post-1' },
    });

    // Снять звёздочку можно и с поста, которого уже нет: ответ тот же.
    await expect(
      service.setFavorite('viewer', false, 'gone', false),
    ).resolves.toEqual({
      favorited: false,
    });
    expect(prisma.blogFavorite.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'viewer', postId: 'gone' },
    });
  });

  it('answers 404 for a missing post', async () => {
    const { service } = withFavorites(null);
    await expect(
      service.setFavorite('viewer', false, 'post-1', true),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('BlogService lineage (VED-596)', () => {
  it('sets the lineage of a post and returns it in the card', async () => {
    const { service, prisma } = build(storedPost());
    prisma.blogPost.update.mockResolvedValue(
      storedPost({ lineage: 'sri_chaitanya_saraswat_math' }),
    );

    const dto = await service.setLineage(
      'admin',
      'post-1',
      'sri_chaitanya_saraswat_math',
    );

    expect(prisma.blogPost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'post-1' },
        data: { lineage: 'sri_chaitanya_saraswat_math' },
      }),
    );
    expect(dto.lineage).toBe('sri_chaitanya_saraswat_math');
  });

  it('clears the lineage with null — the post is for everyone', async () => {
    const { service, prisma } = build(storedPost({ lineage: 'iskcon' }));
    prisma.blogPost.update.mockResolvedValue(storedPost({ lineage: null }));

    const dto = await service.setLineage('admin', 'post-1', null);

    expect(prisma.blogPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lineage: null } }),
    );
    expect(dto.lineage).toBeNull();
  });

  it('refuses a value outside the directory before touching the post', async () => {
    const { service, prisma } = build(storedPost());
    await expect(
      service.setLineage('admin', 'post-1', 'group:parivara'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.blogPost.update).not.toHaveBeenCalled();
  });

  it('answers 404 for a missing post', async () => {
    const { service } = build(null);
    await expect(
      service.setLineage('admin', 'post-1', 'iskcon'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('filters the feed by lineage and keeps posts for everyone', async () => {
    const { service, prisma } = build(storedPost());
    const findMany = fn(() => Promise.resolve([]));
    (prisma.blogPost as Record<string, jest.Mock>).findMany = findMany;

    await service.feed('viewer', false, { scope: 'all', lineage: 'iskcon' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { feedStatus: 'feed' },
            { OR: [{ lineage: 'iskcon' }, { lineage: null }] },
          ],
        },
      }),
    );
  });

  it('leaves the feed unfiltered without a lineage', async () => {
    const { service, prisma } = build(storedPost());
    const findMany = fn(() => Promise.resolve([]));
    (prisma.blogPost as Record<string, jest.Mock>).findMany = findMany;

    await service.feed('viewer', false, { scope: 'all', lineage: 'all' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { feedStatus: 'feed' } }),
    );
  });
});

describe('BlogService own lineage (VED-590)', () => {
  it('the author sets the lineage of their post', async () => {
    const { service, prisma } = build(storedPost());
    prisma.blogPost.update.mockResolvedValue(storedPost({ lineage: 'iskcon' }));

    const dto = await service.setOwnLineage(
      'author',
      false,
      'post-1',
      'iskcon',
    );

    expect(prisma.blogPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lineage: 'iskcon' } }),
    );
    expect(dto.lineage).toBe('iskcon');
  });

  it('«all» makes the post for everyone', async () => {
    const { service, prisma } = build(storedPost({ lineage: 'iskcon' }));
    await service.setOwnLineage('author', false, 'post-1', 'all');
    expect(prisma.blogPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lineage: null } }),
    );
  });

  it('only on their own post; an admin on any', async () => {
    const { service, prisma } = build(storedPost());
    await expect(
      service.setOwnLineage('someone', false, 'post-1', 'iskcon'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.blogPost.update).not.toHaveBeenCalled();

    await service.setOwnLineage('admin', true, 'post-1', 'iskcon');
    expect(prisma.blogPost.update).toHaveBeenCalled();
  });

  it('a repost is not the author’s to mark', async () => {
    const { service } = build(storedPost({ repostOfId: 'origin' }));
    await expect(
      service.setOwnLineage('author', false, 'post-1', 'iskcon'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses garbage before touching the post', async () => {
    const { service, prisma } = build(storedPost());
    await expect(
      service.setOwnLineage('author', false, 'post-1', 'group:parivara'),
    ).rejects.toMatchObject({ message: 'invalid_lineage' });
    expect(prisma.blogPost.update).not.toHaveBeenCalled();
  });
});

describe('BlogService category (VED-590)', () => {
  /** `data` последнего вызова заглушки: что ушло бы в базу. */
  function lastData(mock: jest.Mock): Record<string, unknown> {
    const calls = mock.mock.calls as Array<[{ data: Record<string, unknown> }]>;
    return calls[calls.length - 1][0].data;
  }

  function withCreate(post: ReturnType<typeof storedPost> | null) {
    const built = build(post);
    const blogPost = built.prisma.blogPost as Record<string, jest.Mock>;
    blogPost.create = fn(() => Promise.resolve({ id: 'post-1' }));
    blogPost.count = fn(() => Promise.resolve(0));
    const prisma = built.prisma as unknown as Record<
      string,
      Record<string, jest.Mock>
    >;
    prisma.blogSettings = {
      findUnique: fn(() => Promise.resolve({ feedLifetimeHours: 0 })),
    };
    return { ...built, blogPost };
  }

  it('the author assigns a category when publishing', async () => {
    const { service, blogPost } = withCreate(storedPost());

    await service.create('author', false, {
      text: 'Экадаши',
      category: 'calendar',
      lineage: 'iskcon',
    });

    expect(lastData(blogPost.create).category).toBe('calendar');
    expect(lastData(blogPost.create).lineage).toBe('iskcon');
  });

  it('«for everyone» is stored as no lineage', async () => {
    const { service, blogPost } = withCreate(storedPost());

    await service.create('author', false, {
      text: 'Всем',
      category: 'news',
      lineage: 'all',
    });

    expect(lastData(blogPost.create).lineage).toBeNull();
  });

  it('an old app build without the fields publishes as before', async () => {
    const { service, blogPost } = withCreate(storedPost());

    await service.create('author', false, { text: 'Просто пост' });

    expect(lastData(blogPost.create).category).toBeNull();
    expect(lastData(blogPost.create).lineage).toBeNull();
  });

  it('refuses a sent but empty category or lineage', async () => {
    const { service, blogPost } = withCreate(storedPost());

    await expect(
      service.create('author', false, {
        text: 'Пост',
        category: '' as never,
        lineage: 'all',
      }),
    ).rejects.toMatchObject({ message: 'category_required' });
    await expect(
      service.create('author', false, {
        text: 'Пост',
        category: 'news',
        lineage: '' as never,
      }),
    ).rejects.toMatchObject({ message: 'lineage_required' });
    expect(blogPost.create).not.toHaveBeenCalled();
  });

  it('refuses an unknown category before creating anything', async () => {
    const { service, blogPost } = withCreate(storedPost());

    await expect(
      service.create('author', false, {
        text: 'Пост',
        category: 'sport' as never,
        lineage: 'all',
      }),
    ).rejects.toMatchObject({ message: 'invalid_category' });
    expect(blogPost.create).not.toHaveBeenCalled();
  });

  it('an edit without the field keeps the category', async () => {
    const { service, prisma } = build(storedPost());

    await service.update('author', false, 'post-1', { text: 'Новый' });

    expect(lastData(prisma.blogPost.update)).not.toHaveProperty('category');
  });

  it('an edit changes the category and the lineage but cannot clear them', async () => {
    const { service, prisma } = build(storedPost());

    await service.update('author', false, 'post-1', {
      text: 'Новый',
      category: 'news',
    });
    expect(lastData(prisma.blogPost.update).category).toBe('news');

    await service.update('author', false, 'post-1', {
      text: 'Новый',
      lineage: 'iskcon',
    });
    expect(lastData(prisma.blogPost.update).lineage).toBe('iskcon');

    prisma.blogPost.update.mockClear();
    await expect(
      service.update('author', false, 'post-1', {
        text: 'Новый',
        category: null,
      }),
    ).rejects.toMatchObject({ message: 'category_required' });
    expect(prisma.blogPost.update).not.toHaveBeenCalled();
  });

  it('the category cannot be removed with the button', async () => {
    const { service, prisma } = build(storedPost());
    await expect(
      service.setCategory('author', false, 'post-1', null),
    ).rejects.toMatchObject({ message: 'category_required' });
    expect(prisma.blogPost.update).not.toHaveBeenCalled();
  });

  it('the author sets the category with one button', async () => {
    const { service, prisma } = build(storedPost());
    prisma.blogPost.update.mockResolvedValue(
      storedPost({ category: 'devotee_life' }),
    );

    const dto = await service.setCategory(
      'author',
      false,
      'post-1',
      'devotee_life',
    );

    expect(prisma.blogPost.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { category: 'devotee_life' } }),
    );
    expect(dto.category).toBe('devotee_life');
  });

  it('a stranger cannot set the category, an admin can', async () => {
    const { service, prisma } = build(storedPost());

    await expect(
      service.setCategory('someone', false, 'post-1', 'news'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.blogPost.update).not.toHaveBeenCalled();

    await service.setCategory('admin', true, 'post-1', 'news');
    expect(prisma.blogPost.update).toHaveBeenCalled();
  });

  it('a repost has no category of its own', async () => {
    const { service } = build(storedPost({ repostOfId: 'origin' }));
    await expect(
      service.setCategory('author', false, 'post-1', 'news'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('filters the feed by category', async () => {
    const { service, prisma } = build(storedPost());
    const findMany = fn(() => Promise.resolve([]));
    (prisma.blogPost as Record<string, jest.Mock>).findMany = findMany;

    await service.feed('viewer', false, { scope: 'all', category: 'news' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { AND: [{ feedStatus: 'feed' }, { category: 'news' }] },
      }),
    );
  });
});

describe('BlogService audience stages (VED-590)', () => {
  function lastData(mock: jest.Mock): Record<string, unknown> {
    const calls = mock.mock.calls as Array<[{ data: Record<string, unknown> }]>;
    return calls[calls.length - 1][0].data;
  }

  function withCreate(post: ReturnType<typeof storedPost> | null) {
    const built = build(post);
    const blogPost = built.prisma.blogPost as Record<string, jest.Mock>;
    blogPost.create = fn(() => Promise.resolve({ id: 'post-1' }));
    blogPost.count = fn(() => Promise.resolve(0));
    const prisma = built.prisma as unknown as Record<
      string,
      Record<string, jest.Mock>
    >;
    prisma.blogSettings = {
      findUnique: fn(() => Promise.resolve({ feedLifetimeHours: 0 })),
    };
    return { ...built, blogPost };
  }

  it('the author picks the stages when publishing', async () => {
    const { service, blogPost } = withCreate(storedPost());

    await service.create('author', false, {
      text: 'Пост',
      category: 'news',
      lineage: 'all',
      audienceStages: ['devotee', 'seeker'],
    });

    expect(lastData(blogPost.create).audienceStages).toEqual([
      'seeker',
      'devotee',
    ]);
  });

  it('«for everyone» and all four stages are stored as an empty list', async () => {
    const { service, blogPost } = withCreate(storedPost());

    await service.create('author', false, {
      text: 'Пост',
      audienceStages: 'all',
    });
    expect(lastData(blogPost.create).audienceStages).toEqual([]);

    await service.create('author', false, {
      text: 'Пост',
      audienceStages: ['seeker', 'practitioner', 'yogi', 'devotee'],
    });
    expect(lastData(blogPost.create).audienceStages).toEqual([]);
  });

  it('an old app build without the field publishes for everyone', async () => {
    const { service, blogPost } = withCreate(storedPost());

    await service.create('author', false, { text: 'Пост' });

    expect(lastData(blogPost.create).audienceStages).toEqual([]);
  });

  it('refuses a sent but empty or unknown choice', async () => {
    const { service, blogPost } = withCreate(storedPost());

    await expect(
      service.create('author', false, { text: 'Пост', audienceStages: [] }),
    ).rejects.toMatchObject({ message: 'audience_stages_required' });
    await expect(
      service.create('author', false, {
        text: 'Пост',
        audienceStages: ['guru' as never],
      }),
    ).rejects.toMatchObject({ message: 'invalid_audience_stages' });
    expect(blogPost.create).not.toHaveBeenCalled();
  });

  it('an edit without the field keeps the stages', async () => {
    const { service, prisma } = build(storedPost());

    await service.update('author', false, 'post-1', { text: 'Новый' });
    expect(lastData(prisma.blogPost.update)).not.toHaveProperty(
      'audienceStages',
    );

    await service.update('author', false, 'post-1', {
      text: 'Новый',
      audienceStages: 'yogi' as never,
    });
    expect(lastData(prisma.blogPost.update).audienceStages).toEqual(['yogi']);
  });

  it('the author sets the stages with one button, a stranger cannot', async () => {
    const { service, prisma } = build(storedPost());
    prisma.blogPost.update.mockResolvedValue(
      storedPost({ audienceStages: ['yogi'] }),
    );

    await expect(
      service.setAudienceStages('someone', false, 'post-1', ['yogi']),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.setAudienceStages('author', false, 'post-1', null),
    ).rejects.toMatchObject({ message: 'audience_stages_required' });
    expect(prisma.blogPost.update).not.toHaveBeenCalled();

    const dto = await service.setAudienceStages('author', false, 'post-1', [
      'yogi',
    ]);
    expect(lastData(prisma.blogPost.update)).toEqual({
      audienceStages: ['yogi'],
    });
    expect(dto.audienceStages).toEqual(['yogi']);
  });

  it('shows the viewer posts of the stages chosen and posts for everyone', async () => {
    const { service, prisma } = build(storedPost());
    const findMany = fn(() => Promise.resolve([]));
    (prisma.blogPost as Record<string, jest.Mock>).findMany = findMany;
    prisma.user.findUnique.mockResolvedValue({
      spiritualStage: 'yogi',
      lineage: null,
      showAllStages: false,
      materialFiltersSetAt: null,
      materialStages: [],
      materialLineages: [],
    });

    await service.feed('viewer', false, { scope: 'all' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { feedStatus: 'feed' },
            {
              OR: [
                { audienceStages: { isEmpty: true } },
                { audienceStages: { has: 'yogi' } },
                { authorId: 'viewer' },
              ],
            },
          ],
        },
      }),
    );
  });
});

/** Первый аргумент первого вызова заглушки: у `mock.calls` тип `any`. */
function firstCallArg(calls: readonly unknown[]): unknown {
  const first = calls[0] as unknown[] | undefined;
  return first?.[0];
}

describe('BlogService feed review (VED-686)', () => {
  type PrismaMocks = Record<string, Record<string, jest.Mock>>;

  function withFeed(post: ReturnType<typeof storedPost> | null) {
    const built = build(post);
    const prisma = built.prisma as unknown as PrismaMocks;
    prisma.blogPost.findMany = fn(() => Promise.resolve([]));
    prisma.blogPost.count = fn(() => Promise.resolve(0));
    prisma.blogPost.create = fn(() => Promise.resolve({ id: 'post-1' }));
    prisma.blogSettings = {
      findUnique: fn(() => Promise.resolve({ feedLifetimeHours: 48 })),
    };
    return { ...built, prisma };
  }

  it('creates a personal post with feedStatus personal', async () => {
    const { service, prisma } = withFeed(storedPost());
    await service.create('author', false, {
      text: 'Слова',
      category: 'knowledge',
      lineage: 'all',
      audienceStages: 'all',
      scope: 'personal',
    } as never);
    const arg = firstCallArg(prisma.blogPost.create.mock.calls) as {
      data: { feedStatus: string };
    };
    expect(arg.data.feedStatus).toBe('personal');
  });

  it('rejects an unknown scope with 400', async () => {
    const { service } = withFeed(storedPost());
    await expect(
      service.create('author', false, {
        text: 'Слова',
        category: 'knowledge',
        lineage: 'all',
        audienceStages: 'all',
        scope: 'everywhere',
      } as never),
    ).rejects.toThrow('scope_invalid');
  });

  it('shows only feed posts in the general feed', async () => {
    const { service, prisma } = withFeed(storedPost());
    await service.feed('viewer', false, {});
    const arg = firstCallArg(prisma.blogPost.findMany.mock.calls) as {
      where: { AND?: unknown[]; feedStatus?: string };
    };
    expect(JSON.stringify(arg.where)).toContain('"feedStatus":"feed"');
  });

  it('moves a personal post to pending for its author', async () => {
    const { service, prisma } = withFeed(
      storedPost({ feedStatus: 'personal', feedReviewNote: null }),
    );
    await service.requestFeed('author', 'post-1');
    const arg = firstCallArg(prisma.blogPost.update.mock.calls) as {
      data: Record<string, unknown>;
    };
    expect(arg.data.feedStatus).toBe('pending');
    expect(arg.data.feedRequestedAt).toBeInstanceOf(Date);
    expect(arg.data.feedReviewNote).toBeNull();
  });

  it('answers 404 to a non-author feed request', async () => {
    const { service, prisma } = withFeed(
      storedPost({ feedStatus: 'personal' }),
    );
    await expect(
      service.requestFeed('stranger', 'post-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.blogPost.update).not.toHaveBeenCalled();
  });

  it('does not offer a repost', async () => {
    const { service } = withFeed(
      storedPost({ feedStatus: 'personal', repostOfId: 'orig' }),
    );
    await expect(service.requestFeed('author', 'post-1')).rejects.toThrow(
      'repost_cannot_be_offered',
    );
  });

  it('refuses to repost a post that is not in the feed', async () => {
    const { service, prisma } = withFeed(
      storedPost({ feedStatus: 'personal', authorId: 'author' }),
    );
    await expect(
      service.repost('viewer', false, 'post-1', { text: '' }),
    ).rejects.toThrow('post_not_in_feed');
    expect(prisma.blogPost.create).not.toHaveBeenCalled();
  });

  it('withdraws a pending request back to personal', async () => {
    const { service, prisma } = withFeed(storedPost({ feedStatus: 'pending' }));
    await service.withdrawFeedRequest('author', 'post-1');
    const arg = firstCallArg(prisma.blogPost.update.mock.calls) as {
      data: { feedStatus: string };
    };
    expect(arg.data.feedStatus).toBe('personal');
  });

  it('approve puts the post into the feed and restarts its lifetime', async () => {
    const { service, prisma, events } = withFeed(
      storedPost({ feedStatus: 'pending' }),
    );
    const before = Date.now();
    await service.reviewFeed('admin', 'post-1', { decision: 'approve' });
    const arg = firstCallArg(prisma.blogPost.update.mock.calls) as {
      data: Record<string, unknown>;
    };
    expect(arg.data.feedStatus).toBe('feed');
    expect(arg.data.feedReviewedById).toBe('admin');
    expect(arg.data.feedReviewNote).toBeNull();
    const until = (arg.data.feedUntil as Date).getTime();
    expect(until).toBeGreaterThanOrEqual(before + 48 * 3_600_000);
    expect(events.emit).toHaveBeenCalledWith(
      'admin.action',
      expect.objectContaining({
        action: 'blog.feed-approved',
        actorId: 'admin',
        targetId: 'post-1',
      }),
    );
  });

  it('reject stores the trimmed note and audits it', async () => {
    const { service, prisma, events } = withFeed(
      storedPost({ feedStatus: 'pending' }),
    );
    await service.reviewFeed('admin', 'post-1', {
      decision: 'reject',
      note: '  Не по теме ',
    });
    const arg = firstCallArg(prisma.blogPost.update.mock.calls) as {
      data: Record<string, unknown>;
    };
    expect(arg.data.feedStatus).toBe('rejected');
    expect(arg.data.feedReviewNote).toBe('Не по теме');
    expect(arg.data.feedUntil).toBeUndefined();
    expect(events.emit).toHaveBeenCalledWith(
      'admin.action',
      expect.objectContaining({ action: 'blog.feed-rejected' }),
    );
  });

  it('answers 409 when the post is not pending', async () => {
    const { service, prisma } = withFeed(storedPost({ feedStatus: 'feed' }));
    await expect(
      service.reviewFeed('admin', 'post-1', { decision: 'approve' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.blogPost.update).not.toHaveBeenCalled();
  });

  it('hides the review note from strangers', async () => {
    const post = storedPost({
      feedStatus: 'rejected',
      feedReviewNote: 'Не по теме',
    });
    const { service } = withFeed(post);
    await expect(
      service.post('author', false, 'post-1'),
    ).resolves.toMatchObject({
      feedStatus: 'rejected',
      feedReviewNote: 'Не по теме',
    });
    await expect(
      service.post('viewer', false, 'post-1'),
    ).resolves.toMatchObject({ feedReviewNote: null });
  });
});

describe('BlogService.publicPost (VED-718)', () => {
  // Карточку ссылки собирает мессенджер без входа: ей нужны заголовок, начало
  // текста и картинки — и ничего из того, чего гость не должен видеть.
  it('returns title, excerpt and media, nothing private', async () => {
    const { service } = build(
      storedPost({
        feedStatus: 'feed',
        text: `  Первый абзац.\n\n  Второй   абзац ${'слов '.repeat(60)}`,
        images: [
          {
            id: 'p',
            kind: 'photo',
            url: 'https://cdn/p.webp',
            width: 3,
            height: 4,
            posterUrl: null,
            durationSec: null,
          },
        ],
      }),
    );

    const post = await service.publicPost('post-1');

    expect(post).toEqual({
      id: 'post-1',
      title: 'Заголовок',
      excerpt: expect.stringMatching(/^Первый абзац\. Второй абзац/),
      media: [
        {
          id: 'p',
          kind: 'photo',
          url: 'https://cdn/p.webp',
          width: 3,
          height: 4,
          posterUrl: null,
          durationSec: null,
        },
      ],
    });
    // Одна строка и короче предела: такое описание и уходит в og:description.
    expect(post.excerpt).not.toContain('\n');
    expect(post.excerpt.length).toBeLessThanOrEqual(280);
    expect(post).not.toHaveProperty('author');
    expect(post).not.toHaveProperty('likeCount');
    expect(post).not.toHaveProperty('feedStatus');
  });

  // Личное, ожидающее и отклонённое по прямой ссылке не светим.
  it('hides a post that is not in the general feed', async () => {
    const { service } = build(storedPost({ feedStatus: 'personal' }));

    await expect(service.publicPost('post-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('answers 404 for a post that is gone', async () => {
    const { service } = build(null);

    await expect(service.publicPost('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
