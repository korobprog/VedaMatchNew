import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
  const service = new BlogService(
    prisma as unknown as PrismaService,
    moderation as unknown as ModerationService,
    images as unknown as BlogImagesService,
    video as unknown as BlogVideoService,
    avatars as unknown as BlogAvatarService,
  );
  return { service, prisma, images, video, avatars };
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
          AND: [{}, { OR: [{ lineage: 'iskcon' }, { lineage: null }] }],
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
      expect.objectContaining({ where: {} }),
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

  it('refuses to publish without a category or a lineage', async () => {
    const { service, blogPost } = withCreate(storedPost());

    await expect(
      service.create('author', false, { text: 'Просто пост' }),
    ).rejects.toMatchObject({ message: 'category_required' });
    await expect(
      service.create('author', false, { text: 'Пост', category: 'news' }),
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
      expect.objectContaining({ where: { AND: [{}, { category: 'news' }] } }),
    );
  });
});
