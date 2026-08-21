import { buildEntryWhere, groupDuplicates } from './library-admin-query';

describe('buildEntryWhere', () => {
  it('пустой запрос не фильтрует', () => {
    expect(buildEntryWhere({})).toEqual({});
  });

  it('фильтрует по статусу', () => {
    expect(buildEntryWhere({ status: 'removed_by_admin' })).toEqual({
      status: 'removed_by_admin',
    });
  });

  it('«без обогащения» — это всё, кроме ready', () => {
    expect(buildEntryWhere({ notEnrichedOnly: true })).toEqual({
      enrichmentStatus: { not: 'ready' },
    });
  });

  it('ищет и по ссылке, и по домену, и по заголовкам', () => {
    expect(buildEntryWhere({ q: ' bhagavad ' })).toEqual({
      OR: [
        { url: { contains: 'bhagavad', mode: 'insensitive' } },
        { domain: { contains: 'bhagavad', mode: 'insensitive' } },
        { titleRu: { contains: 'bhagavad', mode: 'insensitive' } },
        { titleEn: { contains: 'bhagavad', mode: 'insensitive' } },
      ],
    });
  });

  it('пустой поиск не превращается в фильтр по пустой строке', () => {
    expect(buildEntryWhere({ q: '   ' })).toEqual({});
  });

  it('складывает условия вместе', () => {
    const where = buildEntryWhere({
      q: 'gita',
      status: 'published',
      notEnrichedOnly: true,
    });

    expect(where.status).toBe('published');
    expect(where.enrichmentStatus).toEqual({ not: 'ready' });
    expect(where.OR).toHaveLength(4);
  });
});

describe('groupDuplicates', () => {
  it('одиночки в группы не попадают: дубль — это два и более', () => {
    expect(
      groupDuplicates([
        { row: 'a', key: 'книги' },
        { row: 'b', key: 'видео' },
      ]),
    ).toEqual([]);
  });

  it('собирает совпадения по ключу', () => {
    expect(
      groupDuplicates([
        { row: 'a', key: 'книги' },
        { row: 'b', key: 'книги' },
        { row: 'c', key: 'видео' },
        { row: 'd', key: 'книги' },
      ]),
    ).toEqual([{ key: 'книги', rows: ['a', 'b', 'd'] }]);
  });

  it('сохраняет порядок, в котором пришли строки', () => {
    const [group] = groupDuplicates([
      { row: 'первая', key: 'k' },
      { row: 'вторая', key: 'k' },
    ]);

    expect(group.rows).toEqual(['первая', 'вторая']);
  });

  it('пустой ключ не группирует: нормализация могла ничего не дать', () => {
    expect(
      groupDuplicates([
        { row: 'a', key: '' },
        { row: 'b', key: '' },
      ]),
    ).toEqual([]);
  });
});
