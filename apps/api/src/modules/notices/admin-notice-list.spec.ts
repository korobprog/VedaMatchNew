import {
  buildAdminNoticeListWhere,
  parseAdminNoticeListQuery,
} from './admin-notice-list';

describe('parseAdminNoticeListQuery', () => {
  it('пустой запрос — первая страница, 20 в ней, без фильтров', () => {
    expect(parseAdminNoticeListQuery({})).toEqual({
      q: '',
      status: null,
      page: 1,
      pageSize: 20,
    });
  });

  it('обрезает пробелы по краям поискового текста', () => {
    expect(parseAdminNoticeListQuery({ q: '  Ищу помощь  ' }).q).toBe(
      'Ищу помощь',
    );
  });

  it('слишком длинный поиск обрезается до 200 символов', () => {
    const long = 'а'.repeat(500);
    expect(parseAdminNoticeListQuery({ q: long }).q).toHaveLength(200);
  });

  it('известный статус принимается как есть', () => {
    expect(parseAdminNoticeListQuery({ status: 'published' }).status).toBe(
      'published',
    );
  });

  it('незнакомый статус читается как «все» — не роняет запрос', () => {
    expect(parseAdminNoticeListQuery({ status: 'not-a-status' }).status).toBe(
      null,
    );
  });

  it('номер страницы и размер зажаты в разумные границы', () => {
    expect(parseAdminNoticeListQuery({ page: '0' }).page).toBe(1);
    expect(parseAdminNoticeListQuery({ page: '-5' }).page).toBe(1);
    expect(parseAdminNoticeListQuery({ page: 'мусор' }).page).toBe(1);
    expect(parseAdminNoticeListQuery({ pageSize: '500' }).pageSize).toBe(100);
    expect(parseAdminNoticeListQuery({ pageSize: '0' }).pageSize).toBe(1);
  });
});

describe('buildAdminNoticeListWhere', () => {
  it('без фильтров — пустой where, список целиком', () => {
    expect(
      buildAdminNoticeListWhere({
        q: '',
        status: null,
        page: 1,
        pageSize: 20,
      }),
    ).toEqual({});
  });

  it('статус уходит в where как есть', () => {
    expect(
      buildAdminNoticeListWhere({
        q: '',
        status: 'hidden_by_reports',
        page: 1,
        pageSize: 20,
      }),
    ).toEqual({ status: 'hidden_by_reports' });
  });

  it('поиск ищет и в заголовке на двух языках, и в имени автора', () => {
    const where = buildAdminNoticeListWhere({
      q: 'коса',
      status: null,
      page: 1,
      pageSize: 20,
    });
    expect(where.OR).toEqual([
      { titleRu: { contains: 'коса', mode: 'insensitive' } },
      { titleEn: { contains: 'коса', mode: 'insensitive' } },
      { author: { name: { contains: 'коса', mode: 'insensitive' } } },
    ]);
  });

  it('статус и поиск складываются в одном запросе', () => {
    const where = buildAdminNoticeListWhere({
      q: 'дом',
      status: 'published',
      page: 1,
      pageSize: 20,
    });
    expect(where.status).toBe('published');
    expect(where.OR).toHaveLength(3);
  });
});
