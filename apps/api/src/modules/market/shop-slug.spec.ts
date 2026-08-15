import {
  RESERVED_SHOP_SLUGS,
  buildShopSlug,
  isReservedShopSlug,
  withSlugSuffix,
} from './shop-slug';

describe('buildShopSlug', () => {
  it('transliterates cyrillic names', () => {
    expect(buildShopSlug('Мастерская Говинды')).toBe('masterskaya-govindy');
    expect(buildShopSlug('Щи да каша')).toBe('schi-da-kasha');
    expect(buildShopSlug('Ёлка')).toBe('elka');
  });

  it('drops soft and hard signs instead of replacing them', () => {
    expect(buildShopSlug('Соль')).toBe('sol');
    expect(buildShopSlug('Подъезд')).toBe('podezd');
  });

  it('lowercases and collapses separators', () => {
    expect(buildShopSlug('  ЭКО   Лавка  ')).toBe('eko-lavka');
    expect(buildShopSlug('Чай & Специи')).toBe('chay-specii');
    expect(buildShopSlug('a---b')).toBe('a-b');
  });

  it('keeps latin names intact', () => {
    expect(buildShopSlug('Govinda Store')).toBe('govinda-store');
    expect(buildShopSlug('shop-2024')).toBe('shop-2024');
  });

  it('falls back to "shop" when nothing survives normalisation', () => {
    expect(buildShopSlug('🌸🌿')).toBe('shop');
    expect(buildShopSlug('...')).toBe('shop');
    expect(buildShopSlug('')).toBe('shop');
  });

  it('never emits a leading or trailing dash', () => {
    for (const name of ['-Лавка-', '  Лавка  ', '!!!Лавка!!!']) {
      const slug = buildShopSlug(name);
      expect(slug.startsWith('-')).toBe(false);
      expect(slug.endsWith('-')).toBe(false);
    }
  });
});

describe('withSlugSuffix', () => {
  it('leaves the first attempt untouched and numbers the rest from two', () => {
    expect(withSlugSuffix('lavka', 0)).toBe('lavka');
    expect(withSlugSuffix('lavka', 1)).toBe('lavka-2');
    expect(withSlugSuffix('lavka', 4)).toBe('lavka-5');
  });
});

describe('reserved slugs', () => {
  it('protects every first-level Market route', () => {
    for (const slug of ['cart', 'orders', 'chats', 'sell', 'listing', 'rules']) {
      expect(isReservedShopSlug(slug)).toBe(true);
    }
  });

  it('lets ordinary shop names through', () => {
    expect(isReservedShopSlug('masterskaya-govindy')).toBe(false);
    expect(isReservedShopSlug('lavka')).toBe(false);
  });

  // Слаг магазина строится buildShopSlug, поэтому в списке не должно быть
  // значений, до которых генератор в принципе не может дойти.
  it('contains only slugs the generator can actually produce', () => {
    for (const slug of RESERVED_SHOP_SLUGS) {
      expect(buildShopSlug(slug)).toBe(slug);
    }
  });
});
