import { BadRequestException } from '@nestjs/common';
import { MarketOrdersService } from './market-orders.service';

/**
 * Статусный переход заявки должен быть CAS-ом по текущему статусу: две
 * параллельные смены (продавец отклонил + покупатель отменил) иначе обе
 * проходят и возвращают остаток дважды.
 */
function makeService(opts: { updatedCount: number }) {
  const order = {
    id: 'o1',
    number: 1,
    status: 'new_request',
    buyerId: 'buyer',
    declineReason: null,
    shop: { id: 's1', ownerId: 'seller', name: 'Shop', slug: 's', logoUrl: null },
    items: [{ listingId: 'l1', quantity: 2 }],
  };
  const tx = {
    marketOrder: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.updatedCount }),
    },
    marketListing: {
      findUnique: jest.fn().mockResolvedValue({ trackStock: true }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    marketOrder: { findUnique: jest.fn().mockResolvedValue(order) },
    $transaction: jest.fn(
      (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    ),
  };
  const events = { emit: jest.fn() };
  const service = new MarketOrdersService(prisma as never, events as never);
  jest
    .spyOn(service, 'byId')
    .mockResolvedValue({ id: 'o1', status: 'declined_by_seller' } as never);
  return { service, tx, events };
}

describe('MarketOrdersService.setStatus — CAS по статусу', () => {
  it('переход выполняется только из проверенного статуса', async () => {
    const { service, tx, events } = makeService({ updatedCount: 1 });
    await service.setStatus('seller', false, 'o1', {
      status: 'declined_by_seller',
    });
    expect(tx.marketOrder.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'o1', status: 'new_request' } }),
    );
    // Остаток вернулся ровно один раз.
    expect(tx.marketListing.update).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('если статус успели сменить параллельно — 400 и остаток не трогаем', async () => {
    const { service, tx, events } = makeService({ updatedCount: 0 });
    await expect(
      service.setStatus('buyer', false, 'o1', { status: 'cancelled_by_buyer' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.marketListing.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});
