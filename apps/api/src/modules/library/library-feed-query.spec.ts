import {
  decodeCursor,
  encodeCursor,
  feedOrderBy,
  resolveSort,
} from './library-feed-query';

describe('feed cursor', () => {
  it('round-trips publishedAt and id', () => {
    const cursor = encodeCursor({
      publishedAt: new Date('2026-07-29T10:00:00.000Z'),
      id: 'entry-1',
    });

    expect(decodeCursor(cursor)).toEqual({
      publishedAt: new Date('2026-07-29T10:00:00.000Z'),
      id: 'entry-1',
    });
  });

  it.each([undefined, '', 'garbage', 'eyJ4IjoxfQ=='])(
    'returns null for %s instead of throwing',
    (cursor) => {
      expect(decodeCursor(cursor as string | undefined)).toBeNull();
    },
  );
});

describe('resolveSort', () => {
  it('defaults to new in phase A and rejects later-phase sorts', () => {
    expect(resolveSort(undefined)).toBe('new');
    expect(resolveSort('unknown')).toBe('new');
    expect(resolveSort('popular')).toBe('new');
    expect(resolveSort('actual')).toBe('new');
  });
});

describe('feedOrderBy', () => {
  it('always adds id as a tie-breaker for stable pagination', () => {
    expect(feedOrderBy('new')).toEqual([{ publishedAt: 'desc' }, { id: 'desc' }]);
  });
});
