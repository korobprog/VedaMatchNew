import { parseListingFilters } from './market-listing-filters';

describe('parseListingFilters', () => {
  it('returns an empty-ish filter set for an empty query', () => {
    expect(parseListingFilters({})).toEqual({
      q: undefined,
      kind: undefined,
      sectionSlug: undefined,
      categorySlug: undefined,
      shopSlug: undefined,
      shelfSlug: undefined,
      priceMin: undefined,
      priceMax: undefined,
      currency: undefined,
      condition: undefined,
      serviceFormat: undefined,
      city: undefined,
      country: undefined,
      delivery: undefined,
      available: false,
      favorited: false,
      sort: undefined,
      cursor: undefined,
    });
  });

  it('treats blank strings as absent, not as a filter', () => {
    const parsed = parseListingFilters({
      q: '   ',
      city: '',
      cursor: '  ',
      priceMin: '',
      priceMax: '   ',
    });
    expect(parsed.q).toBeUndefined();
    expect(parsed.city).toBeUndefined();
    expect(parsed.cursor).toBeUndefined();
    expect(parsed.priceMin).toBeUndefined();
    expect(parsed.priceMax).toBeUndefined();
  });

  it('trims surrounding whitespace from text filters', () => {
    const parsed = parseListingFilters({ q: '  мриданга ', city: ' Москва ' });
    expect(parsed.q).toBe('мриданга');
    expect(parsed.city).toBe('Москва');
  });

  it('parses prices, including the comma decimal separator', () => {
    expect(parseListingFilters({ priceMin: '100' }).priceMin).toBe(100);
    expect(parseListingFilters({ priceMax: '1299,50' }).priceMax).toBe(1299.5);
    expect(parseListingFilters({ priceMax: '1299.50' }).priceMax).toBe(1299.5);
    expect(parseListingFilters({ priceMin: '0' }).priceMin).toBe(0);
  });

  it('drops prices that are not usable numbers', () => {
    for (const priceMin of ['abc', '-5', 'NaN', 'Infinity']) {
      expect(parseListingFilters({ priceMin }).priceMin).toBeUndefined();
    }
  });

  // Пустой параметр в адресе означает «фильтр сброшен»: `?available=` не должен
  // внезапно включать фильтр наличия.
  it('turns flags on only for an explicit "true"', () => {
    expect(parseListingFilters({ available: 'true' }).available).toBe(true);
    expect(parseListingFilters({ favorited: 'true' }).favorited).toBe(true);
    for (const value of ['false', '1', '', 'yes', 'TRUE']) {
      expect(parseListingFilters({ available: value }).available).toBe(false);
      expect(parseListingFilters({ favorited: value }).favorited).toBe(false);
    }
  });

  it('passes enum-shaped values straight through', () => {
    const parsed = parseListingFilters({
      kind: 'service',
      currency: 'eur',
      condition: 'like_new',
      serviceFormat: 'online',
      delivery: 'cdek',
      sort: 'price_asc',
    });
    expect(parsed).toMatchObject({
      kind: 'service',
      currency: 'eur',
      condition: 'like_new',
      serviceFormat: 'online',
      delivery: 'cdek',
      sort: 'price_asc',
    });
  });

  it('keeps slug filters intact', () => {
    const parsed = parseListingFilters({
      sectionSlug: 'devotional',
      categorySlug: 'japa-malas',
      shopSlug: 'masterskaya-govindy',
      shelfSlug: 'new-arrivals',
    });
    expect(parsed).toMatchObject({
      sectionSlug: 'devotional',
      categorySlug: 'japa-malas',
      shopSlug: 'masterskaya-govindy',
      shelfSlug: 'new-arrivals',
    });
  });
});
