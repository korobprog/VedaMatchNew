import { BadRequestException } from '@nestjs/common';
import { MarketCartService } from './market-cart.service';

/**
 * Способ доставки при оформлении: только из enum и только из предложенных
 * магазином — иначе продавцу приезжает заявка «курьером» от магазина на
 * самовывозе, а мусор вместо enum падает 500-кой в Prisma.
 */
function makeService(shopDeliveryOptions: string[]) {
  const cartRow = {
    listingId: 'l1',
    quantity: 1,
    listing: {
      id: 'l1',
      titleRu: 'Товар',
      titleEn: null,
      primaryImageUrl: null,
      priceMode: 'fixed',
      priceMinor: 1000,
      priceMaxMinor: null,
      currency: 'rub',
      status: 'published',
      trackStock: false,
      quantity: null,
      shop: {
        id: 's1',
        slug: 'shop',
        name: 'Shop',
        logoUrl: null,
        status: 'active',
        ownerId: 'seller',
        deliveryOptions: shopDeliveryOptions,
      },
    },
  };
  const tx = {
    marketCartItem: {
      findMany: jest.fn().mockResolvedValue([cartRow]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    marketOrder: { create: jest.fn().mockResolvedValue({ id: 'o1' }) },
    marketListing: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    marketShop: {
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({ ownerId: 'seller' }),
    },
  };
  const prisma = {
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
    marketShop: tx.marketShop,
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ name: 'B', spiritualName: null }),
    },
  };
  const orders = {
    byId: jest.fn().mockResolvedValue({
      id: 'o1',
      number: 1,
      shop: { id: 's1', name: 'Shop', slug: 'shop' },
      totalMinor: 1000,
      currency: 'rub',
      items: [{ listingId: 'l1' }],
    }),
  };
  const events = { emit: jest.fn() };
  const service = new MarketCartService(
    prisma as never,
    orders as never,
    events as never,
  );
  return { service, tx };
}

describe('MarketCartService.checkout — способ доставки', () => {
  it('вариант, который магазин не предлагает → 400 delivery_option_unavailable', async () => {
    const { service, tx } = makeService(['pickup']);
    await expect(
      service.checkout('buyer', {
        groups: [{ shopId: 's1', currency: 'rub', deliveryOption: 'courier' }],
      }),
    ).rejects.toMatchObject(
      new BadRequestException('delivery_option_unavailable'),
    );
    expect(tx.marketOrder.create).not.toHaveBeenCalled();
  });

  it('мусор вместо enum → 400, а не падение в Prisma', async () => {
    const { service, tx } = makeService(['pickup']);
    await expect(
      service.checkout('buyer', {
        groups: [
          {
            shopId: 's1',
            currency: 'rub',
            deliveryOption: 'teleport' as never,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.marketOrder.create).not.toHaveBeenCalled();
  });

  it('предложенный магазином вариант проходит и попадает в заявку', async () => {
    const { service, tx } = makeService(['pickup', 'courier']);
    await service.checkout('buyer', {
      groups: [{ shopId: 's1', currency: 'rub', deliveryOption: 'courier' }],
    });
    expect(tx.marketOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryOption: 'courier' }),
      }),
    );
  });

  it('без способа доставки — null (услуги, «по договорённости»)', async () => {
    const { service, tx } = makeService([]);
    await service.checkout('buyer', {
      groups: [{ shopId: 's1', currency: 'rub' }],
    });
    expect(tx.marketOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveryOption: null }),
      }),
    );
  });
});
