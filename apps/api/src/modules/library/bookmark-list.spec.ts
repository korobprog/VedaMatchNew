import { toBookmarkList, type BookmarkRow } from './bookmark-list';

function row(
  id: string,
  status = 'published',
  titles: { titleRu: string | null; titleEn: string | null } = {
    titleRu: `Название ${id}`,
    titleEn: null,
  },
): BookmarkRow {
  return {
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    entry: { id, type: 'article', status, ...titles },
  };
}

describe('toBookmarkList', () => {
  it('keeps the order and the full titles of the bookmarked entries', () => {
    expect(
      toBookmarkList([
        row('b'),
        row('a', 'published', { titleRu: null, titleEn: 'Vedas' }),
      ]),
    ).toEqual({
      items: [
        {
          id: 'b',
          type: 'article',
          titleRu: 'Название b',
          titleEn: null,
          bookmarkedAt: '2026-09-01T10:00:00.000Z',
        },
        {
          id: 'a',
          type: 'article',
          titleRu: null,
          titleEn: 'Vedas',
          bookmarkedAt: '2026-09-01T10:00:00.000Z',
        },
      ],
    });
  });

  it('drops entries that are no longer published', () => {
    const list = toBookmarkList([row('a', 'hidden'), row('b')]);
    expect(list.items.map((item) => item.id)).toEqual(['b']);
  });

  it('answers with an empty list when nothing is bookmarked', () => {
    expect(toBookmarkList([])).toEqual({ items: [] });
  });
});
