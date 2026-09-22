import { buildInboxSearchClauses, parseInboxSearch } from './inbox-search';

describe('parseInboxSearch', () => {
  it('пустой запрос — это обычная лента, а не поиск по пустоте', () => {
    expect(parseInboxSearch(undefined)).toBeNull();
    expect(parseInboxSearch('')).toBeNull();
    expect(parseInboxSearch('   ')).toBeNull();
    expect(parseInboxSearch('\n\t')).toBeNull();
  });

  it('не строку не ищет: в query-параметр прилетает что угодно', () => {
    expect(parseInboxSearch(42)).toBeNull();
    expect(parseInboxSearch(['ved'])).toBeNull();
    expect(parseInboxSearch(null)).toBeNull();
  });

  it('обрезает края и разбирает запрос на слова', () => {
    expect(parseInboxSearch('  VED-160   комментарий ')).toEqual({
      raw: 'VED-160   комментарий',
      terms: ['VED-160', 'комментарий'],
    });
  });

  it('регистр не трогает: человеку запрос показывается тем же, каким набран', () => {
    expect(parseInboxSearch('Маму Тхакур')?.terms).toEqual(['Маму', 'Тхакур']);
  });

  it('длинную строку режет, а слов берёт не больше шести', () => {
    const long = 'я'.repeat(300);
    expect(parseInboxSearch(long)?.raw).toHaveLength(100);
    expect(parseInboxSearch('а б в г д е ж з')?.terms).toEqual([
      'а',
      'б',
      'в',
      'г',
      'д',
      'е',
    ]);
  });
});

describe('buildInboxSearchClauses', () => {
  it('без запроса условий нет', () => {
    expect(buildInboxSearchClauses(null)).toEqual([]);
  });

  it('слово ищется и в заголовке, и в тексте, без оглядки на регистр', () => {
    expect(buildInboxSearchClauses(parseInboxSearch('ved'))).toEqual([
      {
        OR: [
          { title: { contains: 'ved', mode: 'insensitive' } },
          { body: { contains: 'ved', mode: 'insensitive' } },
        ],
      },
    ]);
  });

  /**
   * Каждое слово — своё условие, и складываются они через `AND` на стороне
   * вызова: «VED-160 комментарий» должно сужать выдачу, а не добавлять к ней
   * все комментарии портала.
   */
  it('на каждое слово своё условие', () => {
    const clauses = buildInboxSearchClauses(
      parseInboxSearch('VED-160 комментарий'),
    );

    expect(clauses).toHaveLength(2);
    expect(clauses[1].OR[0].title.contains).toBe('комментарий');
  });

  /** `contains` уходит параметром запроса, поэтому проценты ищутся как есть. */
  it('символы шаблона LIKE остаются частью искомого слова', () => {
    expect(buildInboxSearchClauses(parseInboxSearch('50%'))[0].OR[0]).toEqual({
      title: { contains: '50%', mode: 'insensitive' },
    });
  });
});
