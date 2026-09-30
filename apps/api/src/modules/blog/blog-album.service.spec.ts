/* VED-686: сервис альбома личной страницы. */
import { NotFoundException } from '@nestjs/common';
import { BLOG_ALBUM_MAX_PHOTOS } from '@vedamatch/shared';
import { BlogAlbumService } from './blog-album.service';

const USER = 'user-1';

function setup(existing = 0) {
  const prisma = {
    user: { findUnique: jest.fn() },
    blogAlbumPhoto: {
      count: jest.fn().mockResolvedValue(existing),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue({}),
      create: jest
        .fn()
        .mockImplementation(({ data }: { data: { storageKey: string } }) =>
          Promise.resolve({
            id: `p-${data.storageKey}`,
            caption: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            ...data,
          }),
        ),
    },
  };
  const images = {
    configured: true,
    storeAlbumPhoto: jest.fn().mockImplementation((userId: string) =>
      Promise.resolve({
        key: `blog/album/${userId}/x.webp`,
        url: 'https://cdn/x.webp',
        width: 800,
        height: 600,
        sizeBytes: 1234,
      }),
    ),
    remove: jest.fn().mockResolvedValue(undefined),
  };
  const moderation = { hiddenUserIds: jest.fn().mockResolvedValue(new Set()) };
  const service = new BlogAlbumService(
    prisma as never,
    moderation as never,
    images as never,
  );
  return { service, prisma, images };
}

const photo = (name = 'a.jpg') => ({
  buffer: Buffer.from('x'),
  mimetype: 'image/jpeg',
  size: 1000,
  originalname: name,
});

describe('BlogAlbumService.upload', () => {
  it('сохраняет фото и возвращает их', async () => {
    const { service, images, prisma } = setup();
    const res = await service.upload(USER, [photo(), photo('b.jpg')]);
    expect(res.photos).toHaveLength(2);
    expect(res.failed).toEqual([]);
    expect(images.storeAlbumPhoto).toHaveBeenCalledTimes(2);
    expect(prisma.blogAlbumPhoto.create).toHaveBeenCalledTimes(2);
  });

  it('фото сверх предела альбома получают album_full', async () => {
    const { service, images } = setup(BLOG_ALBUM_MAX_PHOTOS - 1);
    const res = await service.upload(USER, [photo('a.jpg'), photo('b.jpg')]);
    expect(res.photos).toHaveLength(1);
    expect(res.failed).toEqual([{ name: 'b.jpg', reason: 'album_full' }]);
    expect(images.storeAlbumPhoto).toHaveBeenCalledTimes(1);
  });

  it('битая картинка получает processing_failed, остальные ложатся', async () => {
    const { service, images } = setup();
    images.storeAlbumPhoto.mockRejectedValueOnce(new Error('sharp'));
    const res = await service.upload(USER, [photo('bad.jpg'), photo('ok.jpg')]);
    expect(res.failed).toEqual([
      { name: 'bad.jpg', reason: 'processing_failed' },
    ]);
    expect(res.photos).toHaveLength(1);
  });

  it('без файлов — no_files', async () => {
    const { service } = setup();
    await expect(service.upload(USER, [])).rejects.toThrow('no_files');
  });

  it('без настроенного хранилища — image_upload_unavailable', async () => {
    const { service, images } = setup();
    images.configured = false;
    await expect(service.upload(USER, [photo()])).rejects.toThrow(
      'image_upload_unavailable',
    );
  });
});

describe('BlogAlbumService.remove', () => {
  it('чужое фото — photo_not_found', async () => {
    const { service, prisma, images } = setup();
    prisma.blogAlbumPhoto.findUnique.mockResolvedValue({
      id: 'p1',
      userId: 'other',
      storageKey: 'k',
    });
    await expect(service.remove(USER, 'p1')).rejects.toThrow(NotFoundException);
    expect(prisma.blogAlbumPhoto.delete).not.toHaveBeenCalled();
    expect(images.remove).not.toHaveBeenCalled();
  });

  it('своё фото удаляет строку и объект', async () => {
    const { service, prisma, images } = setup();
    prisma.blogAlbumPhoto.findUnique.mockResolvedValue({
      id: 'p1',
      userId: USER,
      storageKey: 'k',
    });
    await service.remove(USER, 'p1');
    expect(prisma.blogAlbumPhoto.delete).toHaveBeenCalledWith({
      where: { id: 'p1' },
    });
    expect(images.remove).toHaveBeenCalledWith('k');
  });
});
