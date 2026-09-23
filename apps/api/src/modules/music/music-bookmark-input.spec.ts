import {
  clampBookmarkPosition,
  normalizeBookmarkLabel,
} from './music-bookmark-input';

describe('normalizeBookmarkLabel', () => {
  it('не присланное отличает от стёртого', () => {
    expect(normalizeBookmarkLabel(undefined)).toBeUndefined();
    expect(normalizeBookmarkLabel(null)).toBeNull();
  });

  it('пробелы сжимает, пустое — null', () => {
    expect(normalizeBookmarkLabel('  стих \n 2.13  ')).toBe('стих 2.13');
    expect(normalizeBookmarkLabel('   ')).toBeNull();
    expect(normalizeBookmarkLabel(42)).toBeNull();
  });

  it('длинное обрезает по символам, не ломая буквы', () => {
    const long = 'ॐ'.repeat(200);
    const cut = normalizeBookmarkLabel(long);
    expect(Array.from(cut ?? '')).toHaveLength(120);
  });
});

describe('clampBookmarkPosition', () => {
  it('целые секунды в пределах записи', () => {
    expect(clampBookmarkPosition(12.9, 600)).toBe(12);
    expect(clampBookmarkPosition(-3, 600)).toBe(0);
    expect(clampBookmarkPosition(900, 600)).toBe(600);
  });

  it('без известной длительности сверху не зажимает', () => {
    expect(clampBookmarkPosition(900, 0)).toBe(900);
  });

  it('не число — null', () => {
    expect(clampBookmarkPosition('12', 600)).toBeNull();
    expect(clampBookmarkPosition(Number.NaN, 600)).toBeNull();
    expect(clampBookmarkPosition(undefined, 600)).toBeNull();
  });
});
