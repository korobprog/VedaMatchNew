import {
  decodeCursor,
  decodeOffsetCursor,
  encodeCursor,
  encodeOffsetCursor,
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
      expect(decodeCursor(cursor)).toBeNull();
    },
  );
});

describe('resolveSort', () => {
  it('accepts title for the author page «По алфавиту» (VED-573)', () => {
    expect(resolveSort('title')).toBe('title');
  });

  it('defaults to new in phase A and rejects later-phase sorts', () => {
    expect(resolveSort(undefined)).toBe('new');
    expect(resolveSort('unknown')).toBe('new');
    expect(resolveSort('popular')).toBe('new');
    expect(resolveSort('actual')).toBe('new');
  });
});

describe('feedOrderBy', () => {
  it('always adds id as a tie-breaker for stable pagination', () => {
    expect(feedOrderBy('new')).toEqual([
      { publishedAt: 'desc' },
      { id: 'desc' },
    ]);
  });
});

describe('feedOrderBy: title', () => {
  it('sorts by ru then en title, nulls last, id as tie-breaker', () => {
    expect(feedOrderBy('title')).toEqual([
      { titleRu: { sort: 'asc', nulls: 'last' } },
      { titleEn: { sort: 'asc', nulls: 'last' } },
      { id: 'asc' },
    ]);
  });
});

describe('offset cursor', () => {
  it('round-trips the offset', () => {
    expect(decodeOffsetCursor(encodeOffsetCursor(20))).toBe(20);
  });

  it('does not accept a date cursor as an offset', () => {
    const dated = encodeCursor({
      publishedAt: new Date('2026-07-29T10:00:00.000Z'),
      id: 'entry-1',
    });
    expect(decodeOffsetCursor(dated)).toBeNull();
  });

  it.each([undefined, '', 'garbage'])('returns null for %s', (cursor) => {
    expect(decodeOffsetCursor(cursor)).toBeNull();
  });

  it('rejects a negative or fractional offset', () => {
    const bad = (o: number) =>
      Buffer.from(JSON.stringify({ s: 'title', o }), 'utf8').toString(
        'base64url',
      );
    expect(decodeOffsetCursor(bad(-1))).toBeNull();
    expect(decodeOffsetCursor(bad(1.5))).toBeNull();
  });
});
