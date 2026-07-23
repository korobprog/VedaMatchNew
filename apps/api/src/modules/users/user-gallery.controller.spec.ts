import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  INTERCEPTORS_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class AuthGuard {},
  CurrentUser: () => () => undefined,
}));

const mockFilesInterceptor = jest.fn(() => class FilesInterceptor {});

jest.mock('@nestjs/platform-express', () => ({
  FilesInterceptor: mockFilesInterceptor,
}));

import { AuthGuard } from '../auth/auth.guard';
import { UserGalleryController } from './user-gallery.controller';
import type { UserGalleryService } from './user-gallery.service';

describe('UserGalleryController', () => {
  const user = { sub: 'user-id' };
  let gallery: {
    getGallery: jest.Mock;
    uploadMany: jest.Mock;
    updateVisibility: jest.Mock;
    reorder: jest.Mock;
    remove: jest.Mock;
  };
  let controller: UserGalleryController;

  beforeEach(() => {
    gallery = {
      getGallery: jest.fn(),
      uploadMany: jest.fn(),
      updateVisibility: jest.fn(),
      reorder: jest.fn(),
      remove: jest.fn(),
    };
    controller = new UserGalleryController(gallery as UserGalleryService);
  });

  it('declares the guarded profile photos route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, UserGalleryController)).toBe(
      'profile/photos',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, UserGalleryController),
    ).toContain(AuthGuard);
    expect(Reflect.getMetadata(PATH_METADATA, handler('getGallery'))).toBe('/');
    expect(
      Reflect.getMetadata(PATH_METADATA, handler('updateVisibility')),
    ).toBe(':id');
    expect(Reflect.getMetadata(PATH_METADATA, handler('reorder'))).toBe(
      'order',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler('remove'))).toBe(':id');
  });

  it('uses the files multipart interceptor with the per-request batch limit', () => {
    const interceptors = Reflect.getMetadata(
      INTERCEPTORS_METADATA,
      handler('upload'),
    ) as unknown[];

    expect(interceptors).toHaveLength(1);
    expect(mockFilesInterceptor).toHaveBeenCalledWith('files', 50);
  });

  it('delegates gallery retrieval for the authenticated user', async () => {
    await controller.getGallery(user);

    expect(gallery.getGallery).toHaveBeenCalledWith('user-id');
  });

  it('delegates multipart uploads and normalizes missing files', async () => {
    const files = [
      {
        buffer: Buffer.from('photo'),
        mimetype: 'image/jpeg',
        originalname: 'photo.jpg',
        size: 5,
      },
    ];

    await controller.upload(user, files);
    await controller.upload(user, undefined);

    expect(gallery.uploadMany).toHaveBeenNthCalledWith(1, 'user-id', files);
    expect(gallery.uploadMany).toHaveBeenNthCalledWith(2, 'user-id', []);
  });

  it('delegates visibility updates and reorder requests unchanged', async () => {
    await controller.updateVisibility(user, 'photo-id', { isPublic: true });
    await controller.reorder(user, { photoIds: ['a', 'b'] });

    expect(gallery.updateVisibility).toHaveBeenCalledWith(
      'user-id',
      'photo-id',
      {
        isPublic: true,
      },
    );
    expect(gallery.reorder).toHaveBeenCalledWith('user-id', {
      photoIds: ['a', 'b'],
    });
  });

  it('delegates deletion and returns HTTP 204 metadata', async () => {
    await controller.remove(user, 'photo-id');

    expect(gallery.remove).toHaveBeenCalledWith('user-id', 'photo-id');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler('remove'))).toBe(
      204,
    );
  });
});

function handler(method: string): object {
  const descriptor = Object.getOwnPropertyDescriptor(
    UserGalleryController.prototype,
    method,
  );
  if (!descriptor || typeof descriptor.value !== 'function') {
    throw new Error(`Missing controller method: ${method}`);
  }
  return descriptor.value as object;
}
