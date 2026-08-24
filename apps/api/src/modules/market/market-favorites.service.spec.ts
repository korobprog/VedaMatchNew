import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { MarketFavoritesService } from './market-favorites.service';

type Mocks = ReturnType<typeof prismaMock>;

function prismaMock(
  listing: {
    id: string;
    status: string;
    priceMinor: number | null;
    titleRu?: string | null;
    titleEn?: string | null;
    shop: { status: string };
  } | null = {
    id: 'listing-1',
    status: 'published',
    priceMinor: 240000,
    titleRu: 'Мала из туласи',
    shop: { status: 'active' },
  },
) {
  const tx = {
    marketFavorite: { create: jest.fn().mockResolvedValue({}) },
    marketListing: { update: jest.fn().mockResolvedValue({}) },
  };
  return {
    marketListing: {
      findUnique: jest.fn().mockResolvedValue(listing),
      update: jest.fn().mockResolvedValue({}),
    },
    marketFavorite: {
      findUnique: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    tx,
  };
}

const eventsMock = () => ({ emit: jest.fn() });

const service = (mocks: Mocks) =>
  new MarketFavoritesService(
    mocks as unknown as PrismaService,
    eventsMock() as never,
  );

describe('add', () => {
  it('creates the row and bumps the counter in one transaction', async () => {
    const mocks = prismaMock();
    await service(mocks).add('user-1', 'listing-1');

    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.marketFavorite.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', listingId: 'listing-1', priceAtFavorite: 240000 },
    });
    expect(mocks.tx.marketListing.update).toHaveBeenCalledWith({
      where: { id: 'listing-1' },
      data: { favoritesCount: { increment: 1 } },
    });
  });

  // Снимок цены — единственная база для уведомления «стало дешевле» в фазе 3.
  it('snapshots the price at the moment of favouriting', async () => {
    const mocks = prismaMock({
      id: 'listing-1',
      status: 'published',
      priceMinor: null,
      shop: { status: 'active' },
    });
    await service(mocks).add('user-1', 'listing-1');
    expect(mocks.tx.marketFavorite.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', listingId: 'listing-1', priceAtFavorite: null },
    });
  });

  // Кнопку нажимают дважды; счётчик обязан остаться верным.
  it('is idempotent and does not double-count', async () => {
    const mocks = prismaMock();
    mocks.marketFavorite.findUnique.mockResolvedValue({ listingId: 'listing-1' });

    await service(mocks).add('user-1', 'listing-1');

    expect(mocks.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.marketListing.update).not.toHaveBeenCalled();
  });

  it('refuses listings that are not publicly visible', async () => {
    for (const listing of [
      null,
      { id: 'l', status: 'draft', priceMinor: 1, shop: { status: 'active' } },
      { id: 'l', status: 'hidden_by_reports', priceMinor: 1, shop: { status: 'active' } },
      { id: 'l', status: 'published', priceMinor: 1, shop: { status: 'blocked_by_admin' } },
    ]) {
      const mocks = prismaMock(listing);
      await expect(service(mocks).add('user-1', 'listing-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mocks.$transaction).not.toHaveBeenCalled();
    }
  });

  // Распроданное объявление остаётся на витрине — по нему пишут «а будет ещё?»,
  // и в избранное его класть можно.
  it('allows favouriting a sold-out listing', async () => {
    const mocks = prismaMock({
      id: 'l',
      status: 'sold_out',
      priceMinor: 100,
      shop: { status: 'active' },
    });
    await expect(service(mocks).add('user-1', 'listing-1')).resolves.toBeUndefined();
    expect(mocks.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('remove', () => {
  it('decrements the counter when a row was actually deleted', async () => {
    const mocks = prismaMock();
    await service(mocks).remove('user-1', 'listing-1');
    expect(mocks.marketListing.update).toHaveBeenCalledWith({
      where: { id: 'listing-1' },
      data: { favoritesCount: { decrement: 1 } },
    });
  });

  it('leaves the counter alone when nothing was deleted', async () => {
    const mocks = prismaMock();
    mocks.marketFavorite.deleteMany.mockResolvedValue({ count: 0 });
    await service(mocks).remove('user-1', 'listing-1');
    expect(mocks.marketListing.update).not.toHaveBeenCalled();
  });
});

describe('markedAmong', () => {
  it('does not query the database for an empty list', async () => {
    const mocks = prismaMock();
    await expect(service(mocks).markedAmong('user-1', [])).resolves.toEqual(new Set());
    expect(mocks.marketFavorite.findMany).not.toHaveBeenCalled();
  });

  it('returns the subset the user marked', async () => {
    const mocks = prismaMock();
    mocks.marketFavorite.findMany.mockResolvedValue([
      { listingId: 'a' },
      { listingId: 'c' },
    ]);
    const marked = await service(mocks).markedAmong('user-1', ['a', 'b', 'c']);
    expect(marked).toEqual(new Set(['a', 'c']));
  });
});
