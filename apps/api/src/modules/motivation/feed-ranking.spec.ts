import {
  rankFeed,
  seedOf,
  shuffleFeed,
  spreadCategories,
} from './feed-ranking';

const day = (n: number) => new Date(Date.UTC(2026, 7, n));

function post(
  id: string,
  overrides: Partial<{
    category: string;
    publishedAt: Date | null;
    viewedAt: Date | null;
  }> = {},
) {
  return {
    id,
    category: 'daily',
    publishedAt: day(1),
    viewedAt: null,
    ...overrides,
  };
}

describe('rankFeed', () => {
  const session = { userId: 'u1', since: day(20), seenBefore: day(10) };

  it('puts fresh unseen posts first, newest on top', () => {
    const ranked = rankFeed(
      [
        post('old', { publishedAt: day(5) }),
        post('new-a', { publishedAt: day(12) }),
        post('new-b', { publishedAt: day(15) }),
      ],
      session,
    );

    expect(ranked.map((item) => `${item.tier}:${item.post.id}`)).toEqual([
      'fresh:new-b',
      'fresh:new-a',
      'unseen:old',
    ]);
  });

  it('treats everything as archive for a newcomer', () => {
    // Новичок: прошлого визита нет, «свежего» яруса тоже — иначе вся лента
    // оказалась бы «свежей» и порядок стал бы просто «новые сверху».
    const ranked = rankFeed(
      [
        post('a', { publishedAt: day(15) }),
        post('b', { publishedAt: day(16) }),
      ],
      { ...session, seenBefore: null },
    );

    expect(ranked.every((item) => item.tier === 'unseen')).toBe(true);
  });

  it('moves posts viewed before the session to the end, oldest view first', () => {
    const ranked = rankFeed(
      [
        post('seen-recent', { viewedAt: day(18) }),
        post('seen-long-ago', { viewedAt: day(2) }),
        post('unseen'),
      ],
      session,
    );

    expect(ranked.map((item) => item.post.id)).toEqual([
      'unseen',
      'seen-long-ago',
      'seen-recent',
    ]);
  });

  it('ignores views made during the session so pages stay aligned', () => {
    // Просмотр, сделанный уже при листании, не должен переставлять пост в
    // хвост: вторая страница считается по тому же порядку, что и первая.
    const ranked = rankFeed(
      [post('a', { viewedAt: day(21) }), post('b')],
      session,
    );

    expect(ranked.map((item) => item.tier)).toEqual(['unseen', 'unseen']);
  });

  it('orders the archive by a per-user seed that is stable between calls', () => {
    const posts = ['a', 'b', 'c', 'd', 'e'].map((id) => post(id));
    const first = rankFeed(posts, session).map((item) => item.post.id);
    const second = rankFeed([...posts].reverse(), session).map(
      (item) => item.post.id,
    );
    const other = rankFeed(posts, { ...session, userId: 'u2' }).map(
      (item) => item.post.id,
    );

    expect(second).toEqual(first);
    expect(other).not.toEqual(first);
    expect([...other].sort()).toEqual([...first].sort());
  });
});

describe('seedOf', () => {
  it('is deterministic and differs per user', () => {
    expect(seedOf('u1', 'p1')).toBe(seedOf('u1', 'p1'));
    expect(seedOf('u1', 'p1')).not.toBe(seedOf('u2', 'p1'));
  });
});

describe('spreadCategories', () => {
  const c = (id: string, category: string) => ({ id, category });

  it('breaks runs longer than the limit by pulling the next other category', () => {
    const spread = spreadCategories(
      [c('1', 'x'), c('2', 'x'), c('3', 'x'), c('4', 'y'), c('5', 'x')],
      2,
    );

    expect(spread.map((item) => item.id)).toEqual(['1', '2', '4', '3', '5']);
  });

  it('leaves the tail alone when no other category is left', () => {
    const input = [c('1', 'x'), c('2', 'x'), c('3', 'x')];

    expect(spreadCategories(input, 2)).toEqual(input);
  });

  it('does not touch an already varied list', () => {
    const input = [c('1', 'x'), c('2', 'y'), c('3', 'x'), c('4', 'y')];

    expect(spreadCategories(input, 2)).toEqual(input);
  });
});

describe('shuffleFeed', () => {
  const posts = Array.from({ length: 12 }, (_, index) => ({
    id: `post-${index}`,
  }));

  it('одно семя — один порядок: вторая страница не уезжает относительно первой', () => {
    const first = shuffleFeed(posts, 'abc123').map((item) => item.post.id);
    const again = shuffleFeed(posts, 'abc123').map((item) => item.post.id);

    expect(again).toEqual(first);
  });

  it('другое семя — другой порядок', () => {
    const first = shuffleFeed(posts, 'abc123').map((item) => item.post.id);
    const other = shuffleFeed(posts, 'def456').map((item) => item.post.id);

    expect(other).not.toEqual(first);
  });

  it('не теряет и не двоит посты', () => {
    const ids = shuffleFeed(posts, 'abc123').map((item) => item.post.id);

    expect(ids).toHaveLength(posts.length);
    expect(new Set(ids).size).toBe(posts.length);
  });

  it('перемешивает, а не оставляет как было', () => {
    const ids = shuffleFeed(posts, 'abc123').map((item) => item.post.id);

    expect(ids).not.toEqual(posts.map((post) => post.id));
  });

  it('не проставляет ярус: в случайном порядке «свежее» ничего не значит', () => {
    expect(shuffleFeed(posts, 'abc123')[0]).not.toHaveProperty('tier');
  });

  it('не трогает исходный список', () => {
    const source = [...posts];
    shuffleFeed(source, 'abc123');

    expect(source.map((post) => post.id)).toEqual(posts.map((post) => post.id));
  });
});
