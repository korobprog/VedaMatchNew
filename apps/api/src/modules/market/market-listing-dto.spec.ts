import { toListingDto, toListingSummary } from './market-listings.service';

type ListingRow = Parameters<typeof toListingSummary>[0];

const row = (over: Record<string, unknown> = {}): ListingRow =>
  ({
    id: 'listing-1',
    shopId: 'shop-1',
    kind: 'product',
    titleRu: 'Мриданга',
    titleEn: null,
    descriptionRu: 'Глиняный корпус',
    descriptionEn: null,
    priceMode: 'fixed',
    priceMinor: 2400000,
    priceMaxMinor: null,
    currency: 'rub',
    condition: 'new_item',
    quantity: 3,
    trackStock: true,
    soldCount: 0,
    serviceFormat: null,
    serviceDurationMinutes: null,
    location: { city: 'Москва', country: 'Россия', lat: 55.75, lon: 37.62 },
    city: 'Москва',
    country: 'Россия',
    deliveryOptions: ['pickup'],
    status: 'published',
    primaryImageUrl: 'https://cdn/a.webp',
    viewsCount: 12,
    favoritesCount: 4,
    commentsCount: 0,
    ordersCount: 1,
    publishedAt: new Date('2026-08-15T10:00:00.000Z'),
    createdAt: new Date('2026-08-14T10:00:00.000Z'),
    shop: {
      id: 'shop-1',
      slug: 'lavka',
      name: 'Лавка',
      logoUrl: null,
      status: 'active',
      ownerId: 'user-1',
    },
    images: [
      {
        id: 'img-1',
        url: 'https://cdn/a.webp',
        width: 800,
        height: 600,
        sortOrder: 0,
      },
    ],
    categories: [
      {
        category: {
          id: 'cat-1',
          slug: 'instruments',
          titleRu: 'Инструменты',
          titleEn: 'Instruments',
          section: { slug: 'devotional' },
        },
      },
    ],
    shelves: [
      {
        shelf: {
          id: 'shelf-1',
          slug: 'new',
          titleRu: 'Новинки',
          titleEn: null,
        },
      },
    ],
    ...over,
  }) as unknown as ListingRow;

describe('toListingSummary', () => {
  it('serialises dates as ISO strings', () => {
    expect(toListingSummary(row(), false, false).publishedAt).toBe(
      '2026-08-15T10:00:00.000Z',
    );
  });

  it('folds the price into a single object', () => {
    expect(toListingSummary(row(), false, false).price).toEqual({
      mode: 'fixed',
      minor: 2400000,
      maxMinor: null,
      currency: 'rub',
    });
  });

  // Риск: поля зрителя не должны утекать как undefined на гостевых маршрутах —
  // веб отличает false от «поля нет», и второе ломает кнопку избранного.
  it('defaults viewer fields to false, never undefined', () => {
    const summary = toListingSummary(row(), false, false);
    expect(summary.favorited).toBe(false);
    expect(summary.favorited).not.toBeUndefined();
  });

  it('reflects the viewer favourite when there is one', () => {
    expect(toListingSummary(row(), true, false).favorited).toBe(true);
  });

  it('never leaks the owner id into the summary', () => {
    const summary = toListingSummary(row(), false, false);
    expect(JSON.stringify(summary)).not.toContain('user-1');
  });

  it('reflects canEdit for the owner', () => {
    expect(toListingSummary(row(), false, false).canEdit).toBe(false);
    expect(toListingSummary(row(), false, true).canEdit).toBe(true);
  });

  describe('availability', () => {
    it('is false when the tracked stock ran out', () => {
      expect(
        toListingSummary(row({ trackStock: true, quantity: 0 }), false, false)
          .available,
      ).toBe(false);
    });

    it('is true when stock is not tracked', () => {
      expect(
        toListingSummary(
          row({ trackStock: false, quantity: null }),
          false,
          false,
        ).available,
      ).toBe(true);
    });

    it('is false for a sold-out listing that is still on display', () => {
      expect(
        toListingSummary(row({ status: 'sold_out' }), false, false).available,
      ).toBe(false);
    });

    it('is false when the shop itself is not active', () => {
      const closed = row({
        shop: {
          id: 'shop-1',
          slug: 'lavka',
          name: 'Лавка',
          logoUrl: null,
          status: 'closed',
          ownerId: 'user-1',
        },
      });
      expect(toListingSummary(closed, false, false).available).toBe(false);
    });
  });
});

describe('toListingDto', () => {
  it('flattens categories with their section slug', () => {
    expect(toListingDto(row(), false, false).categories).toEqual([
      {
        id: 'cat-1',
        slug: 'instruments',
        sectionSlug: 'devotional',
        titleRu: 'Инструменты',
        titleEn: 'Instruments',
      },
    ]);
  });

  it('flattens shelves', () => {
    expect(toListingDto(row(), false, false).shelves).toEqual([
      { id: 'shelf-1', slug: 'new', titleRu: 'Новинки', titleEn: null },
    ]);
  });

  it('carries the gallery through in order', () => {
    expect(toListingDto(row(), false, false).images).toHaveLength(1);
  });

  it('defaults canEdit to false for a visitor', () => {
    expect(toListingDto(row(), false, false).canEdit).toBe(false);
    expect(toListingDto(row(), false, true).canEdit).toBe(true);
  });

  it('keeps everything the summary already exposed', () => {
    const dto = toListingDto(row(), true, true);
    expect(dto).toMatchObject(toListingSummary(row(), true, true));
  });

  it('returns a null location rather than omitting the field', () => {
    expect(
      toListingDto(row({ location: null }), false, false).location,
    ).toBeNull();
  });
});
