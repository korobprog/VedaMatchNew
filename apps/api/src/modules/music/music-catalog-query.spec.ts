import {
  MUSIC_SEARCH_MAX_LENGTH,
  MUSIC_TRACKS_DEFAULT_LIMIT,
  MUSIC_TRACKS_MAX_LIMIT,
  durationCondition,
  normalizeMusicTrackQuery,
} from './music-catalog-query';

describe('normalizeMusicTrackQuery', () => {
  it('на пустом запросе отдаёт значения по умолчанию', () => {
    expect(normalizeMusicTrackQuery({})).toEqual({
      q: null,
      category: null,
      artist: null,
      language: null,
      duration: null,
      live: null,
      sort: 'fresh',
      cursor: null,
      limit: MUSIC_TRACKS_DEFAULT_LIMIT,
    });
  });

  it('берёт первое значение, когда параметр пришёл дважды', () => {
    const result = normalizeMusicTrackQuery({ category: ['kirtan', 'bhajan'] });

    expect(result.category).toBe('kirtan');
  });

  it('пустые строки и пробелы считает отсутствием фильтра', () => {
    const result = normalizeMusicTrackQuery({ category: '   ', artist: '' });

    expect(result.category).toBeNull();
    expect(result.artist).toBeNull();
  });

  it('неизвестную сортировку заменяет на свежее, а не падает', () => {
    expect(normalizeMusicTrackQuery({ sort: 'DROP TABLE' }).sort).toBe('fresh');
    expect(normalizeMusicTrackQuery({ sort: 'popular' }).sort).toBe('popular');
  });

  it('неизвестную корзину длительности отбрасывает', () => {
    expect(normalizeMusicTrackQuery({ duration: 'huge' }).duration).toBeNull();
    expect(normalizeMusicTrackQuery({ duration: 'long' }).duration).toBe(
      'long',
    );
  });

  describe('live', () => {
    it('различает «нет» и «не спрашивали»', () => {
      expect(normalizeMusicTrackQuery({}).live).toBeNull();
      expect(normalizeMusicTrackQuery({ live: 'false' }).live).toBe(false);
      expect(normalizeMusicTrackQuery({ live: '0' }).live).toBe(false);
    });

    it('понимает «да» в обоих написаниях', () => {
      expect(normalizeMusicTrackQuery({ live: 'true' }).live).toBe(true);
      expect(normalizeMusicTrackQuery({ live: '1' }).live).toBe(true);
    });

    it('мусор считает отсутствием фильтра', () => {
      expect(normalizeMusicTrackQuery({ live: 'да' }).live).toBeNull();
    });
  });

  describe('limit', () => {
    it('режет запрошенное по потолку', () => {
      expect(normalizeMusicTrackQuery({ limit: '100000' }).limit).toBe(
        MUSIC_TRACKS_MAX_LIMIT,
      );
    });

    it('нечисловое и неположительное заменяет значением по умолчанию', () => {
      expect(normalizeMusicTrackQuery({ limit: 'все' }).limit).toBe(
        MUSIC_TRACKS_DEFAULT_LIMIT,
      );
      expect(normalizeMusicTrackQuery({ limit: '0' }).limit).toBe(
        MUSIC_TRACKS_DEFAULT_LIMIT,
      );
      expect(normalizeMusicTrackQuery({ limit: '-5' }).limit).toBe(
        MUSIC_TRACKS_DEFAULT_LIMIT,
      );
    });

    it('разумное значение пропускает как есть', () => {
      expect(normalizeMusicTrackQuery({ limit: '10' }).limit).toBe(10);
    });
  });

  describe('поисковая строка', () => {
    it('схлопывает пробелы', () => {
      expect(normalizeMusicTrackQuery({ q: ' джая   радха ' }).q).toBe(
        'джая радха',
      );
    });

    it('режет слишком длинную', () => {
      const long = 'а'.repeat(MUSIC_SEARCH_MAX_LENGTH + 50);

      expect(normalizeMusicTrackQuery({ q: long }).q).toHaveLength(
        MUSIC_SEARCH_MAX_LENGTH,
      );
    });
  });
});

describe('durationCondition', () => {
  it('без корзины не даёт условия', () => {
    expect(durationCondition(null)).toBeNull();
  });

  it('короткие — до пяти минут', () => {
    expect(durationCondition('short')).toEqual({ gte: 0, lt: 300 });
  });

  it('средние — от пяти минут до получаса', () => {
    expect(durationCondition('medium')).toEqual({ gte: 300, lt: 1800 });
  });

  it('длинные — без верхней границы', () => {
    expect(durationCondition('long')).toEqual({ gte: 1800 });
  });

  it('корзины стыкуются без дыр и нахлёста', () => {
    const short = durationCondition('short');
    const medium = durationCondition('medium');
    const long = durationCondition('long');

    expect(short?.lt).toBe(medium?.gte);
    expect(medium?.lt).toBe(long?.gte);
  });
});
