import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

// AuthGuard тянет за собой jose (ESM), который jest не разбирает.
jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class AuthGuard {},
  CurrentUser: () => () => undefined,
}));
jest.mock('jose', () => ({}));

import { LibraryEntriesController } from './library-entries.controller';

function handler(name: string): object {
  return Object.getOwnPropertyDescriptor(
    LibraryEntriesController.prototype,
    name,
  )?.value as object;
}

function build() {
  const entries = {
    byId: jest.fn().mockResolvedValue({ id: 'entry-1', likeCount: 4 }),
  };
  const files = { forEntry: jest.fn().mockResolvedValue([]) };
  const likes = {
    setLike: jest.fn().mockResolvedValue({ liked: true, likeCount: 5 }),
    isLiked: jest.fn().mockResolvedValue(true),
  };
  const controller = new LibraryEntriesController(
    entries as never,
    {} as never,
    {} as never,
    files as never,
    {} as never,
    likes as never,
  );
  return { controller, entries, files, likes };
}

describe('LibraryEntriesController likes (VED-549)', () => {
  it('serves PUT and DELETE library/entries/:id/like', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LibraryEntriesController)).toBe(
      'library/entries',
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler('like'))).toBe(
      ':id/like',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler('like'))).toBe(
      RequestMethod.PUT,
    );
    expect(Reflect.getMetadata(PATH_METADATA, handler('unlike'))).toBe(
      ':id/like',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler('unlike'))).toBe(
      RequestMethod.DELETE,
    );
  });

  it('likes and unlikes as the current user', async () => {
    const { controller, likes } = build();
    const user = { sub: 'user-1' } as never;

    await expect(controller.like(user, 'entry-1')).resolves.toEqual({
      liked: true,
      likeCount: 5,
    });
    expect(likes.setLike).toHaveBeenCalledWith('user-1', 'entry-1', true);

    await controller.unlike(user, 'entry-1');
    expect(likes.setLike).toHaveBeenLastCalledWith('user-1', 'entry-1', false);
  });

  it('adds the viewer mark to the entry page', async () => {
    const { controller, likes } = build();

    await expect(
      controller.byId({ sub: 'user-1' } as never, 'entry-1'),
    ).resolves.toEqual({
      id: 'entry-1',
      likeCount: 4,
      liked: true,
      files: [],
    });
    expect(likes.isLiked).toHaveBeenCalledWith('user-1', 'entry-1');
  });
});
