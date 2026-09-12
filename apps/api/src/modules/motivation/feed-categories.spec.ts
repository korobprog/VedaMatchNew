import {
  MAX_FEED_CATEGORIES,
  feedCategories,
  feedCategoryWhere,
} from './feed-categories';

describe('feedCategories', () => {
  it('без параметра папок нет', () => {
    expect(feedCategories(undefined)).toEqual([]);
    expect(feedCategories('')).toEqual([]);
  });

  it('одна папка остаётся одной — старые ссылки не ломаются', () => {
    expect(feedCategories('vedy')).toEqual(['vedy']);
  });

  it('разбирает список и чистит мусор', () => {
    expect(feedCategories(' vedy , praktika ,, vedy ')).toEqual([
      'vedy',
      'praktika',
    ]);
  });

  // Список в адресе не должен расти без края: запрос с сотней папок — это уже
  // не выбор человека, а чья-то попытка нагрузить базу.
  it('обрезает слишком длинный список', () => {
    const many = Array.from({ length: 40 }, (_, index) => `c${index}`);
    expect(feedCategories(many.join(','))).toHaveLength(MAX_FEED_CATEGORIES);
  });
});

describe('feedCategoryWhere', () => {
  it('без папок отбора нет', () => {
    expect(feedCategoryWhere([])).toBeNull();
  });

  it('одна папка сравнивается напрямую', () => {
    expect(feedCategoryWhere(['vedy'])).toEqual({ category: 'vedy' });
  });

  it('несколько — через in', () => {
    expect(feedCategoryWhere(['vedy', 'praktika'])).toEqual({
      category: { in: ['vedy', 'praktika'] },
    });
  });
});
