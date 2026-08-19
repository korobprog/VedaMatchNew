import {
  firstSentences,
  formatLocator,
  MAX_HIT_LENGTH,
  sortByLocator,
  toSourceHits,
  type SearchUnit,
} from './reel-source-search';

const unit = (overrides: Partial<SearchUnit> = {}): SearchUnit => ({
  bookSlug: 'bhagavad-gita',
  bookTitle: 'Бхагавад-гита как она есть',
  bookAuthor: 'А. Ч. Бхактиведанта Свами Прабхупада',
  chapterSlug: '2',
  locator: { chapter: 2, verse: 47 },
  text: 'Ты имеешь право лишь на действие, но не на его плоды. Не считай себя причиной плодов своей деятельности.',
  ...overrides,
});

describe('toSourceHits', () => {
  it('returns a ready-to-use fragment with its source', () => {
    expect(toSourceHits([unit()])).toEqual([
      {
        text: 'Ты имеешь право лишь на действие, но не на его плоды. Не считай себя причиной плодов своей деятельности.',
        bookSlug: 'bhagavad-gita',
        bookTitle: 'Бхагавад-гита как она есть',
        chapterSlug: '2',
        locator: '2.47',
      },
    ]);
  });

  it('drops books without an author: their attribution cannot be built', () => {
    expect(toSourceHits([unit({ bookAuthor: null })])).toEqual([]);
  });

  it('drops fragments that are too short to be a thought', () => {
    expect(toSourceHits([unit({ text: 'Глава 2' })])).toEqual([]);
  });

  it('cuts a long unit down to whole sentences', () => {
    const sentence =
      'Смирение означает, что человек не считает себя выше других.';
    const long = Array.from({ length: 20 }, () => sentence).join(' ');
    const [hit] = toSourceHits([unit({ text: long })]);

    expect(hit.text.length).toBeLessThanOrEqual(MAX_HIT_LENGTH);
    // Дословность: обрезка идёт по предложениям, а не по символам.
    expect(hit.text.endsWith('.')).toBe(true);
    expect(long).toContain(hit.text);
  });

  it('removes duplicates and honours the limit', () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      unit({
        chapterSlug: String(index),
        text: `Мысль номер ${index}, достаточно длинная для показа человеку.`,
      }),
    );

    expect(toSourceHits([unit(), unit(), ...many], 5)).toHaveLength(5);
  });
});

describe('firstSentences', () => {
  it('returns nothing when even the first sentence does not fit', () => {
    expect(firstSentences('a'.repeat(200) + '.', 50)).toBe('');
  });
});

describe('sortByLocator', () => {
  it('orders verses inside a chapter by their numbers', () => {
    const units = [
      { locator: { verse: 62, chapter: 2 } },
      { locator: { verse: 47, chapter: 2 } },
      { locator: { verse: 48, chapter: 2 } },
    ];

    expect(sortByLocator(units).map((unit) => unit.locator)).toEqual([
      { verse: 47, chapter: 2 },
      { verse: 48, chapter: 2 },
      { verse: 62, chapter: 2 },
    ]);
  });

  it('puts chapters before verses and unknown locators last', () => {
    const units = [
      { locator: null },
      { locator: { chapter: 6, verse: 5 } },
      { locator: { chapter: 2, verse: 47 } },
    ];

    expect(sortByLocator(units).map((unit) => unit.locator)).toEqual([
      { chapter: 2, verse: 47 },
      { chapter: 6, verse: 5 },
      null,
    ]);
  });
});

describe('formatLocator', () => {
  it.each([
    ['2.47', '2.47'],
    [7, '7'],
    [{ chapter: 1, verse: 2 }, '1.2'],
    // Порядок ключей в JSON произвольный — важен смысловой порядок.
    [{ verse: 47, chapter: 2 }, '2.47'],
    [{ canto: 1, chapter: 2, verse: 6 }, '1.2.6'],
    [null, ''],
  ])('formats %p', (input, expected) => {
    expect(formatLocator(input)).toBe(expected);
  });
});
