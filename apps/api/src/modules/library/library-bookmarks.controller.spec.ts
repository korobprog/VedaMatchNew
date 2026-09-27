import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

// AuthGuard тянет за собой jose (ESM), который jest не разбирает.
jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class AuthGuard {},
  CurrentUser: () => () => undefined,
}));

import { LibraryBookmarksController } from './library-bookmarks.controller';

describe('LibraryBookmarksController', () => {
  it('serves GET library/bookmarks', () => {
    expect(Reflect.getMetadata(PATH_METADATA, LibraryBookmarksController)).toBe(
      'library/bookmarks',
    );
    const handler = Object.getOwnPropertyDescriptor(
      LibraryBookmarksController.prototype,
      'list',
    )?.value as object;
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
  });

  it('lists the bookmarks of the current user', async () => {
    const response = { items: [] };
    const bookmarks = { list: jest.fn().mockResolvedValue(response) };
    const controller = new LibraryBookmarksController(bookmarks as never);

    await expect(controller.list({ sub: 'user-1' } as never)).resolves.toBe(
      response,
    );
    expect(bookmarks.list).toHaveBeenCalledWith('user-1');
  });
});
