import type { PrismaService } from '../../prisma/prisma.service';
import { MarketStatsService, conversionRate } from './market-stats.service';

describe('conversionRate', () => {
  // Ноль просмотров — обычное состояние новой витрины, а не аварийное:
  // NaN на дашборде читался бы как поломка.
  it('returns 0 instead of NaN when there are no views', () => {
    expect(conversionRate(0, 0)).toBe(0);
    expect(conversionRate(5, 0)).toBe(0);
    expect(conversionRate(0, 0)).not.toBeNaN();
  });

  it('rounds to three decimals', () => {
    expect(conversionRate(1, 3)).toBe(0.333);
    expect(conversionRate(1, 2)).toBe(0.5);
    expect(conversionRate(7, 1000)).toBe(0.007);
  });

  it('caps out at 1 for a fully converting listing', () => {
    expect(conversionRate(4, 4)).toBe(1);
  });
});

function prismaMock() {
  return {
    marketListing: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { viewsCount: 120, favoritesCount: 9, ordersCount: 6 },
      }),
      count: jest.fn().mockResolvedValue(3),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'a',
          titleRu: 'Мриданга',
          titleEn: 'Mridanga',
          viewsCount: 100,
          favoritesCount: 7,
          ordersCount: 5,
        },
        {
          id: 'b',
          titleRu: null,
          titleEn: 'Kartals',
          viewsCount: 20,
          favoritesCount: 2,
          ordersCount: 1,
        },
      ]),
    },
  };
}

describe('MarketStatsService', () => {
  it('sums the denormalised counters and derives the conversion', async () => {
    const mocks = prismaMock();
    const stats = await new MarketStatsService(
      mocks as unknown as PrismaService,
    ).forShop('shop-1');

    expect(stats).toMatchObject({
      shopId: 'shop-1',
      listingsPublished: 3,
      viewsTotal: 120,
      favoritesTotal: 9,
      ordersTotal: 6,
      conversion: 0.05,
    });
  });

  // Заголовок бывает только на одном языке — карточка в топе не должна
  // оказаться безымянной.
  it('falls back to the english title when there is no russian one', async () => {
    const mocks = prismaMock();
    const stats = await new MarketStatsService(
      mocks as unknown as PrismaService,
    ).forShop('shop-1');

    expect(stats.topListings.map((listing) => listing.title)).toEqual([
      'Мриданга',
      'Kartals',
    ]);
  });

  it('treats an empty shop as all zeroes, not as missing data', async () => {
    const mocks = prismaMock();
    mocks.marketListing.aggregate.mockResolvedValue({
      _sum: { viewsCount: null, favoritesCount: null, ordersCount: null },
    });
    mocks.marketListing.count.mockResolvedValue(0);
    mocks.marketListing.findMany.mockResolvedValue([]);

    const stats = await new MarketStatsService(
      mocks as unknown as PrismaService,
    ).forShop('shop-1');

    expect(stats).toEqual({
      shopId: 'shop-1',
      listingsPublished: 0,
      viewsTotal: 0,
      favoritesTotal: 0,
      ordersTotal: 0,
      conversion: 0,
      topListings: [],
    });
  });

  it('asks for at most five listings, most viewed first', async () => {
    const mocks = prismaMock();
    await new MarketStatsService(mocks as unknown as PrismaService).forShop('shop-1');

    const args = mocks.marketListing.findMany.mock.calls[0][0];
    expect(args.take).toBe(5);
    expect(args.orderBy[0]).toEqual({ viewsCount: 'desc' });
    expect(args.where).toEqual({ shopId: 'shop-1' });
  });
});
