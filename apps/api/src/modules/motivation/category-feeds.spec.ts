import type { MotivationCategoryDto } from '@vedamatch/shared';
import { categoriesForStyle, categoryAcceptsStyle } from './category-feeds';

function category(
  patch: Partial<MotivationCategoryDto> & { id: string },
): MotivationCategoryDto {
  return {
    slug: patch.id,
    title: patch.id,
    sortOrder: 0,
    isDefault: false,
    parentId: null,
    postCount: 0,
    feed: 'both',
    artCount: 0,
    cardsCount: 0,
    ...patch,
  };
}

const slugs = (list: MotivationCategoryDto[]) => list.map((item) => item.slug);

describe('categoryAcceptsStyle', () => {
  it('общая категория принимает обе ленты, своя — только свою', () => {
    expect(categoryAcceptsStyle('both', 'cards')).toBe(true);
    expect(categoryAcceptsStyle('both', 'art')).toBe(true);
    expect(categoryAcceptsStyle('cards', 'cards')).toBe(true);
    expect(categoryAcceptsStyle('cards', 'art')).toBe(false);
    expect(categoryAcceptsStyle('art', 'cards')).toBe(false);
  });
});

describe('categoriesForStyle', () => {
  it('общая категория стоит в меню той ленты, где в ней что-то есть', () => {
    const list = [
      category({ id: 'vedy', artCount: 10 }),
      category({ id: 'praktika', cardsCount: 4 }),
      category({ id: 'mix', artCount: 2, cardsCount: 3 }),
    ];
    expect(slugs(categoriesForStyle(list, 'art'))).toEqual(['vedy', 'mix']);
    expect(slugs(categoriesForStyle(list, 'cards'))).toEqual([
      'praktika',
      'mix',
    ]);
  });

  it('счётчик — только своей ленты', () => {
    const list = [category({ id: 'mix', artCount: 2, cardsCount: 3 })];
    expect(categoriesForStyle(list, 'art')[0].postCount).toBe(2);
    expect(categoriesForStyle(list, 'cards')[0].postCount).toBe(3);
  });

  it('пустая общая видна в обоих меню, пока не решено, чья она', () => {
    const list = [category({ id: 'new' })];
    expect(slugs(categoriesForStyle(list, 'art'))).toEqual(['new']);
    expect(slugs(categoriesForStyle(list, 'cards'))).toEqual(['new']);
  });

  it('категория ленты стоит только в своём меню, даже пустая', () => {
    const list = [
      category({ id: 'cards-only', feed: 'cards' }),
      category({ id: 'art-only', feed: 'art', cardsCount: 1 }),
    ];
    expect(slugs(categoriesForStyle(list, 'cards'))).toEqual(['cards-only']);
    expect(slugs(categoriesForStyle(list, 'art'))).toEqual(['art-only']);
  });

  it('верхняя остаётся, если в меню стоит её подкатегория', () => {
    const list = [
      category({ id: 'root', artCount: 5 }),
      category({ id: 'child', parentId: 'root', cardsCount: 2 }),
      category({ id: 'other', parentId: 'root', artCount: 1 }),
    ];
    const cards = categoriesForStyle(list, 'cards');
    expect(slugs(cards)).toEqual(['root', 'child']);
    expect(cards[0].postCount).toBe(0);
    expect(slugs(categoriesForStyle(list, 'art'))).toEqual(['root', 'other']);
  });

  it('подкатегория чужой ленты уходит из меню вместе с пустым родителем', () => {
    const list = [
      category({ id: 'root', feed: 'art' }),
      category({ id: 'child', parentId: 'root', feed: 'art' }),
    ];
    expect(categoriesForStyle(list, 'cards')).toEqual([]);
  });
});
