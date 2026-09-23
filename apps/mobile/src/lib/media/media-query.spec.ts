import { DEFAULT_MEDIA_FILTER, MEDIA_SEARCH_MAX_LENGTH, mediaFilterKey, mediaTracksPath, normalizeMediaSearch } from './media-query';
import { mediaSections, rootSlugOf, styleChips } from './media-sections';
import type { MediaCategory } from './media-parse';

function query(path: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(path.split('?')[1]));
}

describe('normalizeMediaSearch', () => {
  it('схлопывает пробелы и режет края', () => {
    expect(normalizeMediaSearch('  харе   кришна ')).toBe('харе кришна');
  });

  it('пустое — не ищем', () => {
    expect(normalizeMediaSearch('   ')).toBeNull();
  });

  it('длиннее предела сервера не шлём', () => {
    expect(normalizeMediaSearch('а'.repeat(500))?.length).toBe(MEDIA_SEARCH_MAX_LENGTH);
  });
});

describe('mediaTracksPath', () => {
  it('умолчание: свежее, без фильтров, порция 30', () => {
    expect(query(mediaTracksPath(DEFAULT_MEDIA_FILTER, null))).toEqual({ sort: 'fresh', limit: '30' });
  });

  it('вкладка, стиль, поиск и курсор — как у сайта', () => {
    const path = mediaTracksPath(
      { root: 'traditional', category: 'kirtan', query: ' нама  ', sort: 'popular' },
      'cur 1',
    );
    expect(path.startsWith('/music/tracks?')).toBe(true);
    expect(query(path)).toEqual({
      q: 'нама',
      root: 'traditional',
      category: 'kirtan',
      sort: 'popular',
      cursor: 'cur 1',
      limit: '30',
    });
  });

  it('порция не больше 60 и не меньше 1', () => {
    expect(query(mediaTracksPath(DEFAULT_MEDIA_FILTER, null, 500)).limit).toBe('60');
    expect(query(mediaTracksPath(DEFAULT_MEDIA_FILTER, null, 0)).limit).toBe('1');
  });

  it('ключ выборки не зависит от лишних пробелов в поиске', () => {
    expect(mediaFilterKey({ ...DEFAULT_MEDIA_FILTER, query: 'нама ' })).toBe(
      mediaFilterKey({ ...DEFAULT_MEDIA_FILTER, query: '  нама' }),
    );
    expect(mediaFilterKey({ ...DEFAULT_MEDIA_FILTER, sort: 'title' })).not.toBe(mediaFilterKey(DEFAULT_MEDIA_FILTER));
  });
});

function category(slug: string, title: string, kind: 'root' | 'style', trackCount: number): MediaCategory {
  return { id: slug, slug, title, kind, position: 0, trackCount };
}

const categories = [
  category('traditional', 'Традиционное', 'root', 12),
  category('modern', 'Современное', 'root', 0),
  category('kirtan', 'Киртан', 'style', 8),
  category('lecture', 'Лекции', 'style', 3),
  category('empty', 'Мантра', 'style', 0),
  category('traditional-dup', 'традиционное ', 'style', 0),
];

describe('разделы', () => {
  it('«Всё», корневые с числом и «Аудиокниги» последней', () => {
    expect(mediaSections(categories, true)).toEqual([
      { key: 'all', label: 'Всё', count: null },
      { key: 'root:traditional', label: 'Традиционное', count: 12 },
      { key: 'root:modern', label: 'Современное', count: null },
      { key: 'audiobooks', label: 'Аудиокниги', count: null },
    ]);
  });

  it('без книг вкладки «Аудиокниги» нет', () => {
    expect(mediaSections(categories, false).map((s) => s.key)).not.toContain('audiobooks');
  });

  it('слаг корневой вкладки', () => {
    expect(rootSlugOf('root:modern')).toBe('modern');
    expect(rootSlugOf('all')).toBeNull();
    expect(rootSlugOf('audiobooks')).toBeNull();
  });

  it('стили: без корневых, без их тёзок и без пустых', () => {
    expect(styleChips(categories).map((c) => c.slug)).toEqual(['kirtan', 'lecture']);
  });
});
