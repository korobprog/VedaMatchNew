/* eslint-disable @typescript-eslint/no-require-imports */
import {
  MAX_CATEGORIES_PER_LISTING,
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  PROHIBITED_CATEGORY_SLUGS,
  validateListing,
  type ListingValidationInput,
} from './market-listing-validate';

const { marketCategories } = require('../../../prisma/market-categories-data.js') as {
  marketCategories: Array<{ slug: string; prohibited?: boolean }>;
};

const product = (over: Partial<ListingValidationInput> = {}): ListingValidationInput => ({
  kind: 'product',
  titleRu: 'Мриданга',
  categoryIds: ['cat-1'],
  ...over,
});

const service = (over: Partial<ListingValidationInput> = {}): ListingValidationInput => ({
  kind: 'service',
  titleRu: 'Настройка мриданги',
  serviceFormat: 'offline',
  categoryIds: ['cat-1'],
  ...over,
});

describe('title', () => {
  it('accepts a title in either language alone', () => {
    expect(validateListing(product({ titleRu: 'Мриданга', titleEn: null }))).toBeNull();
    expect(validateListing(product({ titleRu: null, titleEn: 'Mridanga' }))).toBeNull();
  });

  it('requires at least one language', () => {
    expect(validateListing(product({ titleRu: null, titleEn: null }))).toBe(
      'title_required',
    );
    expect(validateListing(product({ titleRu: '   ', titleEn: '' }))).toBe(
      'title_required',
    );
  });

  it('caps the length in both languages', () => {
    const long = 'a'.repeat(MAX_TITLE_LENGTH + 1);
    expect(validateListing(product({ titleRu: long }))).toBe('title_too_long');
    expect(validateListing(product({ titleRu: null, titleEn: long }))).toBe(
      'title_too_long',
    );
    expect(
      validateListing(product({ titleRu: 'a'.repeat(MAX_TITLE_LENGTH) })),
    ).toBeNull();
  });
});

describe('description', () => {
  it('caps the length in both languages', () => {
    const long = 'a'.repeat(MAX_DESCRIPTION_LENGTH + 1);
    expect(validateListing(product({ descriptionRu: long }))).toBe(
      'description_too_long',
    );
    expect(validateListing(product({ descriptionEn: long }))).toBe(
      'description_too_long',
    );
  });

  it('allows an empty description', () => {
    expect(validateListing(product({ descriptionRu: null }))).toBeNull();
  });
});

describe('categories', () => {
  it('requires at least one and allows at most five', () => {
    expect(validateListing(product({ categoryIds: [] }))).toBe('category_required');
    expect(
      validateListing(
        product({
          categoryIds: Array.from(
            { length: MAX_CATEGORIES_PER_LISTING },
            (_, i) => `cat-${i}`,
          ),
        }),
      ),
    ).toBeNull();
    expect(
      validateListing(
        product({
          categoryIds: Array.from(
            { length: MAX_CATEGORIES_PER_LISTING + 1 },
            (_, i) => `cat-${i}`,
          ),
        }),
      ),
    ).toBe('too_many_categories');
  });

  // При частичном обновлении категории могут не приходить вовсе — тогда
  // проверять нечего, а не «пришёл пустой список».
  it('skips the check when categories are not being changed', () => {
    expect(validateListing(product({ categoryIds: undefined }))).toBeNull();
  });

  it('rejects categories forbidden by the Market rules', () => {
    expect(
      validateListing(product({ categorySlugs: ['spices', 'meat-fish-eggs'] })),
    ).toBe('prohibited_category');
    expect(validateListing(product({ categorySlugs: ['spices'] }))).toBeNull();
  });
});

describe('service-only rules', () => {
  it('requires a format', () => {
    expect(validateListing(service({ serviceFormat: null }))).toBe(
      'service_format_required',
    );
  });

  it('forbids a product condition', () => {
    expect(validateListing(service({ condition: 'used' }))).toBe(
      'condition_not_allowed_for_service',
    );
  });

  it('forbids stock tracking and quantity', () => {
    expect(validateListing(service({ trackStock: true, quantity: 3 }))).toBe(
      'quantity_invalid',
    );
    expect(validateListing(service({ quantity: 3 }))).toBe('quantity_invalid');
    expect(validateListing(service({ quantity: null }))).toBeNull();
  });

  it('validates the duration when given', () => {
    expect(validateListing(service({ serviceDurationMinutes: 90 }))).toBeNull();
    expect(validateListing(service({ serviceDurationMinutes: null }))).toBeNull();
    expect(validateListing(service({ serviceDurationMinutes: 0 }))).toBe(
      'service_duration_invalid',
    );
    expect(validateListing(service({ serviceDurationMinutes: -30 }))).toBe(
      'service_duration_invalid',
    );
    expect(validateListing(service({ serviceDurationMinutes: 90.5 }))).toBe(
      'service_duration_invalid',
    );
    expect(validateListing(service({ serviceDurationMinutes: 1441 }))).toBe(
      'service_duration_invalid',
    );
  });
});

describe('product-only rules', () => {
  it('requires a quantity when stock is tracked', () => {
    expect(validateListing(product({ trackStock: true, quantity: 5 }))).toBeNull();
    expect(validateListing(product({ trackStock: true, quantity: 0 }))).toBeNull();
    expect(validateListing(product({ trackStock: true, quantity: null }))).toBe(
      'quantity_invalid',
    );
    expect(validateListing(product({ trackStock: true, quantity: -1 }))).toBe(
      'quantity_invalid',
    );
    expect(validateListing(product({ trackStock: true, quantity: 2.5 }))).toBe(
      'quantity_invalid',
    );
  });

  it('forbids a quantity when stock is not tracked', () => {
    expect(validateListing(product({ trackStock: false, quantity: 5 }))).toBe(
      'quantity_invalid',
    );
    expect(validateListing(product({ quantity: null }))).toBeNull();
  });

  it('allows a condition', () => {
    expect(validateListing(product({ condition: 'like_new' }))).toBeNull();
  });
});

// Список запрещённого живёт в двух местах: сид кладёт флаг в БД, модуль держит
// слаги в рантайме. Разъезд означал бы, что правила Рынка нечем применить.
describe('prohibited list stays in sync with the seed', () => {
  it('matches the categories flagged in market-categories-data.js', () => {
    const seeded = marketCategories
      .filter((category) => category.prohibited)
      .map((category) => category.slug)
      .sort();
    expect([...PROHIBITED_CATEGORY_SLUGS].sort()).toEqual(seeded);
  });
});
