import type { MarketListingSort } from '@vedamatch/shared';
import {
  cursorFilter,
  decodeCursor,
  encodeCursor,
  feedOrderBy,
  resolveSort,
} from './market-feed-query';

const row = {
  id: 'listing-1',
  publishedAt: new Date('2026-08-15T10:00:00.000Z'),
  priceMinor: 129900,
  favoritesCount: 42,
};

describe('resolveSort', () => {
  it('accepts every supported sort', () => {
    for (const sort of ['new', 'price_asc', 'price_desc', 'popular'] as const) {
      expect(resolveSort(sort)).toBe(sort);
    }
  });

  it('falls back to "new" on anything else', () => {
    expect(resolveSort(undefined)).toBe('new');
    expect(resolveSort('')).toBe('new');
    expect(resolveSort('rating')).toBe('new');
    expect(resolveSort('__proto__')).toBe('new');
  });
});

describe('cursor round-trip', () => {
  it('restores the date key for "new"', () => {
    const restored = decodeCursor(encodeCursor('new', row), 'new');
    expect(restored).toEqual({
      sort: 'new',
      publishedAt: row.publishedAt,
      id: 'listing-1',
    });
  });

  it('restores the price key for both price sorts', () => {
    for (const sort of ['price_asc', 'price_desc'] as const) {
      expect(decodeCursor(encodeCursor(sort, row), sort)).toEqual({
        sort,
        priceMinor: 129900,
        id: 'listing-1',
      });
    }
  });

  it('keeps a null price as a legal value, not as corruption', () => {
    const priceless = { ...row, priceMinor: null };
    expect(decodeCursor(encodeCursor('price_asc', priceless), 'price_asc')).toEqual({
      sort: 'price_asc',
      priceMinor: null,
      id: 'listing-1',
    });
  });

  it('restores the favourites key for "popular"', () => {
    expect(decodeCursor(encodeCursor('popular', row), 'popular')).toEqual({
      sort: 'popular',
      favoritesCount: 42,
      id: 'listing-1',
    });
  });

  it('produces url-safe cursors', () => {
    for (const sort of ['new', 'price_asc', 'popular'] as const) {
      expect(encodeCursor(sort, row)).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe('decodeCursor rejects bad input', () => {
  it('returns null for absent and malformed cursors', () => {
    expect(decodeCursor(undefined, 'new')).toBeNull();
    expect(decodeCursor('', 'new')).toBeNull();
    expect(decodeCursor('not-base64!!', 'new')).toBeNull();
    expect(decodeCursor(Buffer.from('{oops').toString('base64url'), 'new')).toBeNull();
  });

  it('returns null when the payload has the wrong shape', () => {
    const noId = Buffer.from(JSON.stringify({ s: 'new', p: '2026-01-01' })).toString(
      'base64url',
    );
    expect(decodeCursor(noId, 'new')).toBeNull();

    const badDate = Buffer.from(
      JSON.stringify({ s: 'new', p: 'not-a-date', i: 'x' }),
    ).toString('base64url');
    expect(decodeCursor(badDate, 'new')).toBeNull();

    const badNumber = Buffer.from(
      JSON.stringify({ s: 'popular', v: 'many', i: 'x' }),
    ).toString('base64url');
    expect(decodeCursor(badNumber, 'popular')).toBeNull();
  });

  // Переключение сортировки должно начинать выдачу заново, а не отдавать
  // страницу, посчитанную по другому ключу.
  it('discards a cursor built for a different sort', () => {
    const cursor = encodeCursor('new', row);
    expect(decodeCursor(cursor, 'price_asc')).toBeNull();
    expect(decodeCursor(cursor, 'popular')).toBeNull();
    expect(decodeCursor(encodeCursor('price_asc', row), 'price_desc')).toBeNull();
  });
});

describe('feedOrderBy', () => {
  const sorts: MarketListingSort[] = ['new', 'price_asc', 'price_desc', 'popular'];

  it('always ends with a deterministic id tie-breaker', () => {
    for (const sort of sorts) {
      const order = feedOrderBy(sort);
      expect(order[order.length - 1]).toEqual({ id: 'desc' });
    }
  });

  it('sends listings without a price to the end of price sorts', () => {
    expect(feedOrderBy('price_asc')[0]).toEqual({
      priceMinor: { sort: 'asc', nulls: 'last' },
    });
    expect(feedOrderBy('price_desc')[0]).toEqual({
      priceMinor: { sort: 'desc', nulls: 'last' },
    });
  });

  it('orders by publication date and popularity for the other sorts', () => {
    expect(feedOrderBy('new')[0]).toEqual({ publishedAt: 'desc' });
    expect(feedOrderBy('popular')[0]).toEqual({ favoritesCount: 'desc' });
  });
});

describe('cursorFilter', () => {
  it('walks strictly past the date key for "new"', () => {
    const cursor = decodeCursor(encodeCursor('new', row), 'new')!;
    expect(cursorFilter(cursor)).toEqual({
      OR: [
        { publishedAt: { lt: row.publishedAt } },
        { publishedAt: row.publishedAt, id: { lt: 'listing-1' } },
      ],
    });
  });

  it('walks strictly past the favourites key for "popular"', () => {
    const cursor = decodeCursor(encodeCursor('popular', row), 'popular')!;
    expect(cursorFilter(cursor)).toEqual({
      OR: [
        { favoritesCount: { lt: 42 } },
        { favoritesCount: 42, id: { lt: 'listing-1' } },
      ],
    });
  });

  it('moves up the price ladder ascending and down descending', () => {
    const asc = decodeCursor(encodeCursor('price_asc', row), 'price_asc')!;
    expect(cursorFilter(asc)).toEqual({
      OR: [
        { priceMinor: { gt: 129900 } },
        { priceMinor: 129900, id: { lt: 'listing-1' } },
        { priceMinor: null },
      ],
    });

    const desc = decodeCursor(encodeCursor('price_desc', row), 'price_desc')!;
    expect(cursorFilter(desc)).toEqual({
      OR: [
        { priceMinor: { lt: 129900 } },
        { priceMinor: 129900, id: { lt: 'listing-1' } },
        { priceMinor: null },
      ],
    });
  });

  // Хвост без цены — отдельная фаза обхода: пока курсор стоит на строке с
  // ценой, хвост впереди; попав в хвост, из него уже не выходим.
  it('stays inside the priceless tail once the cursor enters it', () => {
    const cursor = decodeCursor(
      encodeCursor('price_asc', { ...row, priceMinor: null }),
      'price_asc',
    )!;
    expect(cursorFilter(cursor)).toEqual({
      priceMinor: null,
      id: { lt: 'listing-1' },
    });
  });
});
