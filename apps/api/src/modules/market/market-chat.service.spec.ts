import { NotFoundException } from '@nestjs/common';
import { MarketChatService } from './market-chat.service';

const chatRow = {
  id: 'c1',
  shopId: 's1',
  buyerId: 'buyer',
  listingId: null,
  orderId: null,
  lastMessageAt: null,
  shop: {
    id: 's1',
    slug: 'shop',
    name: 'Shop',
    logoUrl: null,
    ownerId: 'seller',
  },
  buyer: { id: 'buyer', name: 'B', spiritualName: null, avatarUrl: null },
};

function makeService(opts: {
  listing?: { shopId: string } | null;
  order?: { shopId: string; buyerId: string } | null;
  messages?: Array<Record<string, unknown>>;
}) {
  const prisma = {
    marketShop: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ id: 's1', ownerId: 'seller', status: 'active' }),
    },
    marketListing: {
      findUnique: jest.fn().mockResolvedValue(opts.listing ?? null),
    },
    marketOrder: {
      findUnique: jest.fn().mockResolvedValue(opts.order ?? null),
    },
    userBlock: { findFirst: jest.fn().mockResolvedValue(null) },
    marketConversation: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(({ data }) => ({
        ...chatRow,
        listingId: data.listingId,
        orderId: data.orderId,
      })),
    },
    marketMessage: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue(opts.messages ?? []),
    },
  };
  const service = new MarketChatService(
    prisma as never,
    { emit: jest.fn() } as never,
  );
  return { service, prisma };
}

describe('MarketChatService.start — повод должен принадлежать сделке', () => {
  it('listing другого магазина → 404, диалог не создаётся', async () => {
    const { service, prisma } = makeService({ listing: { shopId: 'other' } });
    await expect(
      service.start('buyer', { shopId: 's1', listingId: 'l1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.marketConversation.create).not.toHaveBeenCalled();
  });

  it('чужой заказ (не этого покупателя) → 404', async () => {
    const { service, prisma } = makeService({
      order: { shopId: 's1', buyerId: 'someone-else' },
    });
    await expect(
      service.start('buyer', { shopId: 's1', orderId: 'o1' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.marketConversation.create).not.toHaveBeenCalled();
  });

  it('свои listing и order этого магазина принимаются', async () => {
    const { service, prisma } = makeService({
      listing: { shopId: 's1' },
      order: { shopId: 's1', buyerId: 'buyer' },
    });
    const chat = await service.start('buyer', {
      shopId: 's1',
      listingId: 'l1',
      orderId: 'o1',
    });
    expect(chat.listingId).toBe('l1');
    expect(chat.orderId).toBe('o1');
    expect(prisma.marketConversation.create).toHaveBeenCalledTimes(1);
  });
});

describe('MarketChatService.open — последние сообщения в хронологии', () => {
  it('запрашивает desc + take и разворачивает в asc', async () => {
    const mk = (id: string, iso: string) => ({
      id,
      conversationId: 'c1',
      body: id,
      createdAt: new Date(iso),
      editedAt: null,
      readAt: null,
      fromUserId: 'buyer',
      fromUser: {
        id: 'buyer',
        name: 'B',
        spiritualName: null,
        avatarUrl: null,
      },
    });
    // БД отдаёт от новых к старым — как и попросили.
    const { service, prisma } = makeService({
      messages: [
        mk('m3', '2026-01-03T00:00:00Z'),
        mk('m2', '2026-01-02T00:00:00Z'),
        mk('m1', '2026-01-01T00:00:00Z'),
      ],
    });
    prisma.marketConversation.findUnique.mockResolvedValue(chatRow);

    const state = await service.open('buyer', 'c1');

    expect(prisma.marketMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      }),
    );
    expect(state.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    // Превью — по самому свежему сообщению.
    expect(state.chat.lastMessagePreview).toBe('m3');
  });
});
