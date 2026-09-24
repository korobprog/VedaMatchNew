import {
  BLOG_PAGE_SIZE,
  blogCursorFilter,
  blogHomeTake,
  blogOrderBy,
  decodeBlogCursor,
  encodeBlogCursor,
  takeBlogPage,
} from './blog-feed-query';

const row = (
  id: string,
  createdAt: string,
  pinned = false,
): { id: string; createdAt: Date; pinned: boolean } => ({
  id,
  createdAt: new Date(createdAt),
  pinned,
});

describe('encodeBlogCursor / decodeBlogCursor', () => {
  it('survives a round trip', () => {
    const source = row('post-1', '2026-09-21T12:00:00.000Z', true);
    const decoded = decodeBlogCursor(encodeBlogCursor(source));
    expect(decoded).toEqual({
      pinned: true,
      createdAt: source.createdAt,
      id: 'post-1',
    });
  });

  it('is url-safe', () => {
    const cursor = encodeBlogCursor(row('a+b/c', '2026-09-21T12:00:00.000Z'));
    expect(cursor).toBe(encodeURIComponent(cursor));
  });

  // Испорченный курсор обязан вернуть первую страницу, а не уронить ленту.
  it('returns null for anything unusable', () => {
    expect(decodeBlogCursor(undefined)).toBeNull();
    expect(decodeBlogCursor('')).toBeNull();
    expect(decodeBlogCursor('не base64')).toBeNull();
    expect(
      decodeBlogCursor(Buffer.from('{}', 'utf8').toString('base64url')),
    ).toBeNull();
    expect(
      decodeBlogCursor(
        Buffer.from('{"p":true,"c":"когда-то","i":"x"}', 'utf8').toString(
          'base64url',
        ),
      ),
    ).toBeNull();
    expect(
      decodeBlogCursor(
        Buffer.from(
          '{"p":"yes","c":"2026-09-21T12:00:00.000Z","i":"x"}',
          'utf8',
        ).toString('base64url'),
      ),
    ).toBeNull();
  });
});

describe('blogOrderBy', () => {
  // Закреплённое администратором наверху, дальше один за другим, свежее выше.
  it('puts pinned first, then newest, then id', () => {
    expect(blogOrderBy()).toEqual([
      { pinned: 'desc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});

describe('blogCursorFilter', () => {
  const createdAt = new Date('2026-09-21T12:00:00.000Z');

  it('walks the unpinned tail by date then id', () => {
    expect(blogCursorFilter({ pinned: false, createdAt, id: 'x' })).toEqual({
      pinned: false,
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: 'x' } }],
    });
  });

  // Без этой ветки вторая страница начиналась бы заново с закреплённых
  // постов: первый ключ сортировки булев, и «дальше по дате» его не двигает.
  it('lets a pinned cursor fall through into the unpinned tail', () => {
    const filter = blogCursorFilter({ pinned: true, createdAt, id: 'x' });
    expect(filter.OR).toHaveLength(2);
    expect(filter.OR?.[1]).toEqual({ pinned: false });
  });
});

describe('takeBlogPage', () => {
  it('reports no next page when the extra row is absent', () => {
    const rows = [row('a', '2026-09-21T12:00:00.000Z')];
    expect(takeBlogPage(rows, 3)).toEqual({ items: rows, nextCursor: null });
  });

  it('cuts the probe row off and points the cursor at the last kept row', () => {
    const rows = [
      row('a', '2026-09-21T12:00:00.000Z'),
      row('b', '2026-09-21T11:00:00.000Z'),
      row('c', '2026-09-21T10:00:00.000Z'),
    ];
    const page = takeBlogPage(rows, 2);
    expect(page.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(decodeBlogCursor(page.nextCursor!)?.id).toBe('b');
  });

  it('defaults to the feed page size', () => {
    const rows = Array.from({ length: BLOG_PAGE_SIZE + 1 }, (_, index) =>
      row(`p${index}`, '2026-09-21T12:00:00.000Z'),
    );
    expect(takeBlogPage(rows).items).toHaveLength(BLOG_PAGE_SIZE);
  });

  it('survives an empty page', () => {
    expect(takeBlogPage([], 5)).toEqual({ items: [], nextCursor: null });
  });
});

describe('blogHomeTake', () => {
  // Сборки приложения на телефонах зовут /blog/home без параметров и ждут
  // не больше четырёх постов в полосе.
  it('keeps four posts for callers that send nothing', () => {
    expect(blogHomeTake(undefined)).toBe(4);
    expect(blogHomeTake('')).toBe(4);
    expect(blogHomeTake('whatever')).toBe(4);
  });

  it('gives the web carousel ten', () => {
    expect(blogHomeTake('carousel')).toBe(10);
  });
});
