import {
  buildCategorySlug,
  normalizeTitle,
  withSlugSuffix,
} from './category-slug';

describe('buildCategorySlug', () => {
  it('prefers the english title', () => {
    expect(
      buildCategorySlug({
        titleRu: 'Лекции по Гите',
        titleEn: 'Gita Lectures',
      }),
    ).toBe('gita-lectures');
  });

  it('transliterates russian when english is missing', () => {
    expect(buildCategorySlug({ titleRu: 'Лекции по Гите' })).toBe(
      'lekcii-po-gite',
    );
  });

  it('falls back to a stable placeholder for unsupported scripts', () => {
    expect(buildCategorySlug({ titleRu: '中文' })).toBe('category');
  });
});

describe('normalizeTitle', () => {
  it('lowercases and collapses whitespace and punctuation', () => {
    expect(normalizeTitle('  Лекции   по  Гите!! ')).toBe('лекции по гите');
  });

  it('returns an empty string for missing values', () => {
    expect(normalizeTitle(null)).toBe('');
    expect(normalizeTitle(undefined)).toBe('');
  });
});

describe('withSlugSuffix', () => {
  it('keeps the first attempt clean and numbers the rest', () => {
    expect(withSlugSuffix('gita', 0)).toBe('gita');
    expect(withSlugSuffix('gita', 2)).toBe('gita-3');
  });
});
