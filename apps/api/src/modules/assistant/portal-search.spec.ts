import {
  normalizePortalQuery,
  PORTAL_SEARCH_PER_SERVICE,
  PORTAL_SEARCH_SOURCES,
  portalSearchResult,
} from './portal-search';

const item = (title: string, href = '/library/entry/1') => ({ title, href });

/** Ответы в порядке источников: по умолчанию все ответили пусто. */
function replies(
  overrides: Record<string, unknown>,
): Parameters<typeof portalSearchResult>[1] {
  return PORTAL_SEARCH_SOURCES.map((source) =>
    source.service in overrides
      ? (overrides[source.service] as never)
      : { ok: true, items: [] },
  );
}

describe('normalizePortalQuery', () => {
  it('сжимает пробелы и обрезает края', () => {
    expect(normalizePortalQuery('  Бхагавад   гита ')).toBe('Бхагавад гита');
  });

  it('короче двух символов — искать нечего', () => {
    expect(normalizePortalQuery('я')).toBeNull();
    expect(normalizePortalQuery('   ')).toBeNull();
    expect(normalizePortalQuery(undefined)).toBeNull();
    expect(normalizePortalQuery(['гита'])).toBeNull();
  });

  it('длинный запрос обрезается до 120 символов', () => {
    expect(normalizePortalQuery('я'.repeat(300))).toHaveLength(120);
  });
});

describe('portalSearchResult', () => {
  it('группы идут в порядке источников, а не в порядке ответов', () => {
    const result = portalSearchResult(
      'гита',
      replies({
        music: { ok: true, items: [item('Киртан', '/music/tracks/1')] },
        library: { ok: true, items: [item('Лекция')] },
      }),
    );

    expect(result.groups.map((group) => group.service)).toEqual([
      'library',
      'music',
    ]);
    expect(result.groups[0].items[0]).toMatchObject({
      kind: 'link',
      service: 'library',
      title: 'Лекция',
    });
  });

  it('пустой ответ и отказ группы не дают, молчание — попадает в unavailable', () => {
    const result = portalSearchResult(
      'гита',
      replies({
        library: { ok: false, text: 'сломалось' },
        market: null,
      }),
    );

    expect(result.groups).toEqual([]);
    expect(result.unavailable).toEqual(['market']);
  });

  it('из сервиса берётся не больше пяти карточек и только с внутренней ссылкой', () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      item(`Материал ${index}`),
    );
    const result = portalSearchResult(
      'гита',
      replies({
        library: {
          ok: true,
          items: [item('Наружу', 'https://evil.example'), ...many],
        },
      }),
    );

    expect(result.groups[0].items).toHaveLength(PORTAL_SEARCH_PER_SERVICE);
    expect(result.groups[0].items.map((card) => card.title)).not.toContain(
      'Наружу',
    );
  });

  it('возвращает сам запрос — страница выдачи показывает, что искали', () => {
    expect(portalSearchResult('гита', replies({})).query).toBe('гита');
  });
});
