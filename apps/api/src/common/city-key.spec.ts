import { normalizeCityKey } from './city-key';

describe('normalizeCityKey', () => {
  it('trims and lowercases', () => {
    expect(normalizeCityKey('  Москва ')).toBe('москва');
    expect(normalizeCityKey('New York')).toBe('new york');
  });

  it('returns null for empty input', () => {
    expect(normalizeCityKey(null)).toBeNull();
    expect(normalizeCityKey(undefined)).toBeNull();
    expect(normalizeCityKey('')).toBeNull();
    expect(normalizeCityKey('   ')).toBeNull();
  });

  it('keeps ё as is (no transliteration)', () => {
    expect(normalizeCityKey('Орёл')).toBe('орёл');
  });
});
