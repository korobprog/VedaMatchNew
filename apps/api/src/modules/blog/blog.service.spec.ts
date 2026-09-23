import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
    createdAt: new Date('2026-09-21T10:00:00.000Z'),
    editedAt: null,
    author,
    images: [],
    favorites: [],
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
  const service = new BlogService(
    prisma as unknown as PrismaService,
    moderation as unknown as ModerationService,
    images as unknown as BlogImagesService,
    video as unknown as BlogVideoService,
  );
  return { service, prisma, images, video };
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

    const result = await service.create('author', false, { text: 'Ролик' }, [
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

    const result = await service.create('author', false, { text: 'Длинный' }, [
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
