import { MarketReviewsService } from './market-reviews.service';

/**
 * Рейтинг магазина обновляется атомарно: `{ increment/decrement }` по
 * ratingSum/reviewsCount плюс UPDATE среднего от свежих колонок. Читать
 * `ratingSum` перед записью здесь запрещено — это и был race.
 */
function makeService(opts: {
  order?: Record<string, unknown> | null;
  review?: Record<string, unknown> | null;
}) {
  const tx = {
    marketReview: {
      create: jest.fn().mockResolvedValue({
        id: 'r1',
        orderId: 'o1',
        shopId: 's1',
        listingId: 'l1',
        rating: 5,
        body: null,
        status: 'published',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        authorId: 'buyer',
        author: {
          id: 'buyer',
          name: 'B',
          spiritualName: null,
          avatarUrl: null,
        },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    marketShop: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    marketOrder: {
      findUnique: jest.fn().mockResolvedValue(opts.order ?? null),
    },
    marketReview: {
      findUnique: jest.fn().mockResolvedValue(opts.review ?? null),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ name: 'B', spiritualName: null }),
    },
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const events = { emit: jest.fn() };
  const service = new MarketReviewsService(prisma as never, events as never);
  return { service, tx, prisma, events };
}

const completedOrder = {
  id: 'o1',
  buyerId: 'buyer',
  shopId: 's1',
  status: 'completed',
  shop: { slug: 'shop', ownerId: 'seller' },
  items: [{ listingId: 'l1' }],
  review: null,
};

describe('MarketReviewsService — атомарный рейтинг магазина', () => {
  it('create: increment без чтения текущих счётчиков и пересчёт среднего', async () => {
    const { service, tx } = makeService({ order: completedOrder });
    await service.create('buyer', { orderId: 'o1', rating: 5 });

    expect(tx.marketShop.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.marketShop.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: {
        ratingSum: { increment: 5 },
        reviewsCount: { increment: 1 },
      },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, ...values] = tx.$executeRaw.mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = strings.join('?');
    expect(sql).toMatch(/UPDATE "MarketShop"/);
    expect(sql).toMatch(/SET "ratingAvg"/);
    expect(sql).toMatch(/"ratingSum"::numeric \/ "reviewsCount"/);
    expect(values).toEqual(['s1']);
  });

  it('remove: decrement и тот же пересчёт среднего', async () => {
    const { service, tx } = makeService({
      review: {
        id: 'r1',
        authorId: 'buyer',
        shopId: 's1',
        rating: 4,
        status: 'published',
      },
    });
    await service.remove('buyer', false, 'r1');

    expect(tx.marketReview.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'removed_by_author' } }),
    );
    expect(tx.marketShop.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.marketShop.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: {
        ratingSum: { decrement: 4 },
        reviewsCount: { decrement: 1 },
      },
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('remove: уже снятый отзыв счётчики не трогает', async () => {
    const { service, tx, prisma } = makeService({
      review: {
        id: 'r1',
        authorId: 'buyer',
        shopId: 's1',
        rating: 4,
        status: 'removed_by_author',
      },
    });
    await service.remove('buyer', false, 'r1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.marketShop.update).not.toHaveBeenCalled();
  });
});
