import {
  MAX_PAGE_SIZE,
  PAGE_SIZE,
  buildFeedWhere,
  cursorFilter,
  decodeCursor,
  encodeCursor,
  feedOrderBy,
  parseFeedFilters,
  type FeedViewer,
} from './notice-feed-query';

const now = new Date('2026-08-17T12:00:00.000Z');

const guest: FeedViewer = {
  userId: null,
  isAdmin: false,
  city: null,
  communityIds: [],
};
const member: FeedViewer = {
  userId: 'u1',
  isAdmin: false,
  city: 'Москва',
  communityIds: ['c1'],
};

const filters = (over: Record<string, string | undefined> = {}) =>
  parseFeedFilters(over);

describe('parseFeedFilters', () => {
  it('ставит значения по умолчанию на пустом запросе', () => {
    expect(filters()).toEqual({
      q: null,
      kind: null,
      rubric: null,
      city: null,
      country: null,
      communityId: null,
      // Радиус резолвится в сервисе отдельным запросом, разбор фильтров
      // только оставляет под него место.
      radiusIds: null,
      mine: false,
      cursor: undefined,
      limit: PAGE_SIZE,
    });
  });

  it('отбрасывает неизвестный вид, а не падает', () => {
    expect(filters({ kind: 'barter' }).kind).toBeNull();
    expect(filters({ kind: 'request' }).kind).toBe('request');
  });

  it('держит потолок страницы', () => {
    expect(filters({ limit: '1000' }).limit).toBe(MAX_PAGE_SIZE);
    expect(filters({ limit: '-5' }).limit).toBe(PAGE_SIZE);
    expect(filters({ limit: 'много' }).limit).toBe(PAGE_SIZE);
  });
});

describe('курсор', () => {
  const row = { publishedAt: new Date('2026-08-01T10:00:00.000Z'), id: 'n1' };

  it('кодируется и читается обратно', () => {
    expect(decodeCursor(encodeCursor(row))).toEqual(row);
  });

  it('испорченный курсор возвращает первую страницу, а не роняет ленту', () => {
    expect(decodeCursor('не-base64')).toBeNull();
    expect(decodeCursor(Buffer.from('{}').toString('base64url'))).toBeNull();
    expect(
      decodeCursor(
        Buffer.from(JSON.stringify({ p: 'вчера', i: 'n1' })).toString(
          'base64url',
        ),
      ),
    ).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
  });

  it('id вторым ключом — иначе страницы теряют и дублируют записи', () => {
    expect(feedOrderBy()).toEqual([{ publishedAt: 'desc' }, { id: 'desc' }]);
    expect(cursorFilter(row)).toEqual({
      OR: [
        { publishedAt: { lt: row.publishedAt } },
        { publishedAt: row.publishedAt, id: { lt: row.id } },
      ],
    });
  });
});

describe('buildFeedWhere: видимость', () => {
  const conditions = (where: ReturnType<typeof buildFeedWhere>) =>
    JSON.stringify(where);

  it('лента показывает только живые опубликованные', () => {
    const where = buildFeedWhere(filters(), guest, now);
    expect(conditions(where)).toContain('"status":"published"');
    // Живость определяется данными, а не работой воркера протухания.
    expect(conditions(where)).toContain('"expiresAt":{"gt"');
  });

  it('гостю видно только everyone', () => {
    const where = buildFeedWhere(filters(), guest, now);
    expect(conditions(where)).toContain('"audience":"everyone"');
    expect(conditions(where)).not.toContain('my_city');
    expect(conditions(where)).not.toContain('my_community');
  });

  it('участнику добавляются его город и его общины', () => {
    const where = conditions(buildFeedWhere(filters(), member, now));
    expect(where).toContain('my_city');
    expect(where).toContain('my_community');
    expect(where).toContain('c1');
    // Своё объявление автор видит всегда, каким бы узким ни был круг.
    expect(where).toContain('"authorId":"u1"');
  });

  it('админ видит всё, без сужения по аудитории', () => {
    const where = conditions(
      buildFeedWhere(filters(), { ...member, isAdmin: true }, now),
    );
    expect(where).not.toContain('my_community');
  });
});

describe('buildFeedWhere: свой кабинет', () => {
  it('mine отдаёт все статусы, но только свои', () => {
    const where = JSON.stringify(
      buildFeedWhere(filters({ mine: 'true' }), member, now),
    );
    expect(where).toContain('"authorId":"u1"');
    expect(where).not.toContain('"status":"published"');
    expect(where).toContain('removed_by_admin');
  });

  it('гостю свой кабинет не отдаётся вовсе', () => {
    // Пустая выдача, а не чужие объявления.
    expect(buildFeedWhere(filters({ mine: 'true' }), guest, now)).toEqual({
      id: '__none__',
    });
  });
});

describe('buildFeedWhere: фильтры', () => {
  it('город сравнивается без регистра', () => {
    const where = JSON.stringify(
      buildFeedWhere(filters({ city: 'москва' }), guest, now),
    );
    expect(where).toContain('"mode":"insensitive"');
  });

  it('поиск идёт по заголовкам и описанию', () => {
    const where = JSON.stringify(
      buildFeedWhere(filters({ q: 'холодильник' }), guest, now),
    );
    expect(where).toContain('titleRu');
    expect(where).toContain('descriptionRu');
  });

  it('рубрика фильтруется по слагу', () => {
    const where = JSON.stringify(
      buildFeedWhere(filters({ rubric: 'giveaway' }), guest, now),
    );
    expect(where).toContain('"slug":"giveaway"');
  });

  it('радиус входит в тот же where списком id', () => {
    // Так курсорная пагинация по-прежнему строится из одного условия:
    // фильтрации после выборки нет даже у гео.
    const where = JSON.stringify(
      buildFeedWhere({ ...filters(), radiusIds: ['n1', 'n2'] }, guest, now),
    );
    expect(where).toContain('"id":{"in":["n1","n2"]}');
  });

  it('пустой радиус даёт пустую выдачу, а не всю доску', () => {
    // Радиус, в который ничего не попало, — это ноль результатов.
    const where = JSON.stringify(
      buildFeedWhere({ ...filters(), radiusIds: [] }, guest, now),
    );
    expect(where).toContain('"id":{"in":[]}');
  });
});
