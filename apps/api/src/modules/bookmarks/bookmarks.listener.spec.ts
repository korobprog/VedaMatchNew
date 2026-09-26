import { PAGE_BOOKMARK_EVENT } from '@vedamatch/shared';
import { BookmarksListener } from './bookmarks.listener';

function setup(create = jest.fn().mockResolvedValue({})) {
  const bookmarks = { create };
  const prisma = {
    bookmarksEntry: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const listener = new BookmarksListener(bookmarks as never, prisma as never);
  return { listener, bookmarks, prisma };
}

describe('BookmarksListener', () => {
  it('listens to the page bookmark event', () => {
    expect(PAGE_BOOKMARK_EVENT).toBe('page.bookmark.toggled');
  });

  it('adds a service page to the portal bookmarks', async () => {
    const { listener, bookmarks } = setup();

    await listener.onPageBookmark({
      userId: 'user-1',
      path: '/library/entry/e1',
      title: 'Русские Веды',
      bookmarked: true,
    });

    expect(bookmarks.create).toHaveBeenCalledWith('user-1', {
      path: '/library/entry/e1',
      title: 'Русские Веды',
    });
  });

  it('removes only this person’s bookmark of that page', async () => {
    const { listener, prisma, bookmarks } = setup();

    await listener.onPageBookmark({
      userId: 'user-1',
      path: '/library/entry/e1',
      title: '',
      bookmarked: false,
    });

    expect(bookmarks.create).not.toHaveBeenCalled();
    expect(prisma.bookmarksEntry.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', path: '/library/entry/e1' },
    });
  });

  it('swallows a refused bookmark (limit) instead of throwing', async () => {
    const { listener } = setup(jest.fn().mockRejectedValue(new Error('limit')));

    await expect(
      listener.onPageBookmark({
        userId: 'user-1',
        path: '/library/entry/e1',
        title: 'x',
        bookmarked: true,
      }),
    ).resolves.toBeUndefined();
  });
});
