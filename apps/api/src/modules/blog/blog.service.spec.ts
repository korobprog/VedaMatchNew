import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BlogService } from './blog.service';
import type { BlogImagesService } from './blog-images.service';
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
  };
  const service = new BlogService(
    prisma as unknown as PrismaService,
    moderation as unknown as ModerationService,
    images as unknown as BlogImagesService,
  );
  return { service, prisma, images };
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
        images: [{ id: 'img-1', storageKey: 'blog/1.webp', position: 0 }],
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
          { id: 'img-1', storageKey: 'blog/1.webp', position: 0 },
          { id: 'img-2', storageKey: 'blog/2.webp', position: 1 },
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
    expect(images.removeMany).toHaveBeenCalledWith(['blog/1.webp']);
  });
});
