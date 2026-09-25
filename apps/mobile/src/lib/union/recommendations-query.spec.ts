import {
  countNarrowingFilters,
  densityLabel,
  emptyStateActions,
  mergeRecommendationPages,
  nextDensity,
  parseDensity,
  recommendationsQuery,
  tileSize,
} from './recommendations-query';
import { unionRecommendation } from './union-fixtures';

describe('recommendationsQuery', () => {
  it('без фильтров — пустая строка', () => {
    expect(recommendationsQuery({})).toBe('');
  });

  it('цели — повторяющимся параметром, иначе сервер увидел бы одну', () => {
    expect(recommendationsQuery({ intentions: ['family', 'service'], page: 2 })).toBe(
      '?intentions=family&intentions=service&page=2',
    );
  });

  it('флаги — словом true, ложные и пустые не отправляются', () => {
    expect(recommendationsQuery({ verifiedOnly: true, photoVerifiedOnly: false, city: '', showAll: true })).toBe(
      '?verifiedOnly=true&showAll=true',
    );
  });

  it('значения кодируются', () => {
    expect(recommendationsQuery({ city: 'Нижний Новгород' })).toBe(
      `?city=${encodeURIComponent('Нижний Новгород')}`,
    );
  });

  it('нечисло не уходит на сервер', () => {
    expect(recommendationsQuery({ radiusKm: Number.NaN, minScore: 70 })).toBe('?minScore=70');
  });
});

describe('mergeRecommendationPages', () => {
  it('приехавшая повторно анкета не встаёт в сетку дважды', () => {
    const a = unionRecommendation({ id: 'a' });
    const b = unionRecommendation({ id: 'b' });
    const c = unionRecommendation({ id: 'c' });
    expect(mergeRecommendationPages([a, b], [b, c]).map((item) => item.user.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('пустая выдача', () => {
  it('расширяющие условия и служебное фильтрами не считаются', () => {
    expect(countNarrowingFilters({ showAll: true, includeSwiped: true, page: 3, sort: 'new' })).toBe(0);
    expect(countNarrowingFilters({ intentions: ['family'], verifiedOnly: true, radiusKm: 50 })).toBe(3);
    expect(countNarrowingFilters({ intentions: [] })).toBe(0);
  });

  it('предлагает показать отсмотренных, если они есть и ещё не показаны', () => {
    expect(emptyStateActions({ narrowingFilterCount: 0, includeSwiped: false, viewedMatchCount: 5 })).toEqual({
      viewedToShow: 5,
      canResetFilters: false,
      nothingHelps: false,
    });
  });

  it('когда отсмотренные уже показаны, повторно их не предлагает', () => {
    expect(emptyStateActions({ narrowingFilterCount: 1, includeSwiped: true, viewedMatchCount: 5 }).viewedToShow).toBeNull();
  });

  it('ни фильтров, ни отсмотренных — честно: людей нет', () => {
    expect(emptyStateActions({ narrowingFilterCount: 0, includeSwiped: false, viewedMatchCount: 0 }).nothingHelps).toBe(true);
  });
});

describe('плотность сетки', () => {
  it('переключается по кругу и подписью обещает результат', () => {
    expect(nextDensity(2)).toBe(3);
    expect(nextDensity(3)).toBe(2);
    expect(densityLabel(2)).toBe('Плотнее');
    expect(densityLabel(3)).toBe('Крупнее');
  });

  it('испорченное сохранённое значение — две колонки', () => {
    expect(parseDensity('3')).toBe(3);
    expect(parseDensity('7')).toBe(2);
    expect(parseDensity(null)).toBe(2);
  });

  it('плитки делят ширину поровну, без дробных пикселей', () => {
    expect(tileSize(375, 2, 16, 8)).toBe(167);
    expect(tileSize(375, 3, 16, 6)).toBe(110);
    expect(tileSize(10, 3, 16, 6)).toBe(0);
  });
});
