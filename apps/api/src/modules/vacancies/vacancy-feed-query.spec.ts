import {
  MAX_PAGE_SIZE,
  PAGE_SIZE,
  buildFeedWhere,
  decodeCursor,
  encodeCursor,
  parseFeedFilters,
  type FeedViewer,
} from './vacancy-feed-query';

const now = new Date('2026-09-08T12:00:00.000Z');
const viewer: FeedViewer = {
  userId: 'me',
  isAdmin: false,
  city: 'Москва',
  communityIds: ['c1'],
  hiddenUserIds: new Set(['blocked']),
};

describe('parseFeedFilters', () => {
  it('незнакомый вид и мусорный лимит откатываются к умолчаниям', () => {
    const filters = parseFeedFilters({ kind: 'job', limit: 'много' });
    expect(filters.kind).toBeNull();
    expect(filters.limit).toBe(PAGE_SIZE);
  });

  it('лимит режется сверху, флаги читаются только как true', () => {
    const filters = parseFeedFilters({
      limit: '500',
      remote: 'true',
      communityOnly: 'yes',
      kind: 'seva',
    });
    expect(filters.limit).toBe(MAX_PAGE_SIZE);
    expect(filters.remote).toBe(true);
    expect(filters.communityOnly).toBe(false);
    expect(filters.kind).toBe('seva');
  });
});

describe('курсор', () => {
  it('кодируется и раскодируется без потерь', () => {
    const cursor = encodeCursor({ publishedAt: now, id: 'x' });
    expect(decodeCursor(cursor)).toEqual({ publishedAt: now, id: 'x' });
  });

  it('испорченный курсор — первая страница, а не ошибка', () => {
    expect(decodeCursor('не base64')).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });
});

describe('buildFeedWhere', () => {
  const filters = parseFeedFilters({});

  it('лента: живые, по аудитории, без заблокированных', () => {
    const where = buildFeedWhere(filters, viewer, now);
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { status: 'published' },
        { expiresAt: { gt: now } },
        { authorId: { notIn: ['blocked'] } },
        {
          OR: [
            { audience: 'everyone' },
            { audience: 'my_city', cityKey: 'москва' },
            { audience: 'my_community', communityId: { in: ['c1'] } },
            { authorId: 'me' },
          ],
        },
      ]),
    );
  });

  it('админ видит всё, кроме удалённого в своём кабинете', () => {
    const where = buildFeedWhere(filters, { ...viewer, isAdmin: true }, now);
    expect(where.AND).not.toEqual(
      expect.arrayContaining([{ authorId: { notIn: ['blocked'] } }]),
    );
    const mine = buildFeedWhere(
      { ...filters, mine: true },
      { ...viewer, isAdmin: true },
      now,
    );
    expect(mine.AND).toEqual([
      { authorId: 'me' },
      { status: { notIn: ['removed_by_admin'] } },
    ]);
  });

  it('город пропускает удалённые предложения, они «из любого города»', () => {
    const where = buildFeedWhere({ ...filters, city: ' Казань ' }, viewer, now);
    expect(where.AND).toEqual(
      expect.arrayContaining([
        { OR: [{ cityKey: 'казань' }, { isRemote: true }] },
      ]),
    );
  });

  it('фильтр «удалённо» перекрывает город', () => {
    const where = buildFeedWhere(
      { ...filters, city: 'Казань', remote: true },
      viewer,
      now,
    );
    expect(where.AND).toEqual(expect.arrayContaining([{ isRemote: true }]));
    expect(JSON.stringify(where)).not.toContain('казань');
  });

  it('«только от общин» — communityId не пуст', () => {
    const where = buildFeedWhere(
      { ...filters, communityOnly: true },
      viewer,
      now,
    );
    expect(where.AND).toEqual(
      expect.arrayContaining([{ communityId: { not: null } }]),
    );
  });
});
