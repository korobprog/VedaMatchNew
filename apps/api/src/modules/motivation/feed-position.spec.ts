import {
  FEED_POSITION_KEY_MAX,
  feedPositionKey,
  startOffset,
} from './feed-position';

describe('feedPositionKey', () => {
  const base = { categories: [], speakerKey: null, workKey: null };

  it('личную ленту не запоминает', () => {
    expect(feedPositionKey(base)).toBeNull();
    expect(feedPositionKey({ ...base, style: 'cards' })).toBeNull();
  });

  it('папка, автор и источник дают ключ', () => {
    expect(
      feedPositionKey({ ...base, style: 'art', categories: ['filosofiya-2'] }),
    ).toBe('art|filosofiya-2||');
    expect(feedPositionKey({ ...base, workKey: 'бхагавад-гита' })).toBe(
      'all|||бхагавад-гита',
    );
    expect(feedPositionKey({ ...base, speakerKey: 'прабхупада' })).toBe(
      'all||прабхупада|',
    );
  });

  it('порядок и повтор папок ключ не меняют', () => {
    expect(
      feedPositionKey({ ...base, categories: ['vedy', 'praktika', 'vedy'] }),
    ).toBe(feedPositionKey({ ...base, categories: ['praktika', 'vedy'] }));
  });

  it('«Лента» и «Открытки» одной папки — разные позиции', () => {
    const art = feedPositionKey({ ...base, style: 'art', categories: ['a'] });
    const cards = feedPositionKey({
      ...base,
      style: 'cards',
      categories: ['a'],
    });
    expect(art).not.toBe(cards);
  });

  it('длинный ключ обрезан под столбец', () => {
    const key = feedPositionKey({ ...base, workKey: 'я'.repeat(1000) });
    expect(key).toHaveLength(FEED_POSITION_KEY_MAX);
  });
});

describe('startOffset', () => {
  const ids = ['a', 'b', 'c'];

  it('находит место поста в ленте', () => {
    expect(startOffset(ids, 'a')).toBe(0);
    expect(startOffset(ids, 'c')).toBe(2);
  });

  it('поста нет в ленте или цели нет — null', () => {
    expect(startOffset(ids, 'z')).toBeNull();
    expect(startOffset(ids, null)).toBeNull();
    expect(startOffset(ids, undefined)).toBeNull();
    expect(startOffset([], 'a')).toBeNull();
  });
});
