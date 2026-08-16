import {
  buildMotivationCategorySlug,
  withCategorySlugSuffix,
} from './category-slug';

describe('buildMotivationCategorySlug', () => {
  it('transliterates Russian titles', () => {
    expect(buildMotivationCategorySlug('Смирение')).toBe('smirenie');
    expect(buildMotivationCategorySlug('Утренняя практика')).toBe(
      'utrennyaya-praktika',
    );
  });

  it('drops punctuation and collapses separators', () => {
    expect(buildMotivationCategorySlug('  Вера — и   доверие!  ')).toBe(
      'vera-i-doverie',
    );
  });

  it('falls back when nothing transliterable is left', () => {
    expect(buildMotivationCategorySlug('!!!')).toBe('category');
    expect(buildMotivationCategorySlug('日本語')).toBe('category');
  });

  it('numbers collisions from the second attempt on', () => {
    expect(withCategorySlugSuffix('vera', 0)).toBe('vera');
    expect(withCategorySlugSuffix('vera', 1)).toBe('vera-2');
  });
});
