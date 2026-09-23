import { Prisma } from '@prisma/client';
import type { NotificationEvent } from '@vedamatch/shared';
import {
  WellnessCheckService,
  type CheckFinish,
} from './wellness-check.service';

const card = {
  id: 'p-1',
  barcode: '3017620422003',
  name: 'Nutella',
  brand: null,
  ingredientsRaw: 'сахар, фундук',
  imageUrl: null,
  source: 'user' as const,
  status: 'draft' as const,
  createdAt: '2026-09-23T10:00:00.000Z',
};

const input = {
  barcode: card.barcode,
  name: card.name,
  brand: null,
  imageUrl: null,
  labelImageUrl: null,
  ingredientsRaw: card.ingredientsRaw,
};

function setup(
  options: { configured?: boolean; userChecksToday?: number } = {},
) {
  const tables = {
    wellnessProduct: {
      findUnique: jest.fn(() => Promise.resolve(null as unknown)),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    wellnessProductCheck: {
      count: jest.fn(() => Promise.resolve(options.userChecksToday ?? 0)),
      create: jest.fn(() => Promise.resolve({})),
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: 'c-1',
          product: { ...card, addedById: 'u-1' },
        } as unknown),
      ),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
      update: jest.fn(() => Promise.resolve({})),
    },
  };
  // Транзакция идёт по тем же таблицам: проверяем, что в неё записано.
  const prisma = {
    ...tables,
    $transaction: jest.fn((fn: (tx: typeof tables) => unknown) => fn(tables)),
  };
  const wellness = {
    createProduct: jest.fn(() => Promise.resolve(card)),
    storeComposition: jest.fn(() => Promise.resolve()),
  };
  const ai = { configured: options.configured ?? true };
  const events: NotificationEvent[] = [];
  const bus = {
    emit: jest.fn((_name: string, event: NotificationEvent) => {
      events.push(event);
      return true;
    }),
  };
  const service = new WellnessCheckService(
    prisma as never,
    wellness as never,
    ai as never,
    bus as never,
  );
  return { service, prisma, wellness, events };
}

const ORIGINAL_ENV = process.env;
beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  delete process.env.WELLNESS_AUTO_CHECK;
  delete process.env.WELLNESS_AI_USER_DAILY_CHECKS;
});
afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('WellnessCheckService.submit — постановка в очередь', () => {
  it('новая карточка встаёт в очередь со снимком и присланными полями', async () => {
    const t = setup();
    await t.service.submit('u-1', input, 'data:image/jpeg;base64,AAAA');
    expect(t.prisma.wellnessProductCheck.create).toHaveBeenCalledWith({
      data: {
        productId: 'p-1',
        status: 'queued',
        reasons: [],
        submittedName: 'Nutella',
        submittedBrand: null,
        submittedIngredients: 'сахар, фундук',
        labelImageDataUrl: 'data:image/jpeg;base64,AAAA',
        finishedAt: null,
      },
    });
    expect(t.events).toEqual([]);
  });

  it('штрихкод уже в базе — повторно не проверяем', async () => {
    const t = setup();
    t.prisma.wellnessProduct.findUnique.mockResolvedValueOnce({ id: 'p-1' });
    await t.service.submit('u-1', input, null);
    expect(t.prisma.wellnessProductCheck.create).not.toHaveBeenCalled();
  });

  it('ИИ не настроен — сразу модератору, снимок не хранится, человек узнаёт', async () => {
    const t = setup({ configured: false });
    await t.service.submit('u-1', input, 'data:image/jpeg;base64,AAAA');
    expect(t.prisma.wellnessProductCheck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'review',
        reasons: ['ai_unavailable'],
        labelImageDataUrl: null,
      }) as unknown,
    });
    expect(t.events).toEqual([
      expect.objectContaining({
        name: 'wellness.product.checked',
        recipientId: 'u-1',
        outcome: 'review',
        reasons: ['ai_unavailable'],
      }),
    ]);
  });

  it('лимит человека за сутки выбран — модератору с причиной', async () => {
    const t = setup({ userChecksToday: 5 });
    await t.service.submit('u-1', input, null);
    expect(t.events[0]).toEqual(
      expect.objectContaining({ reasons: ['user_daily_limit'] }),
    );
  });

  it('в лимит человека не считаются карточки, ушедшие мимо ИИ', async () => {
    const t = setup();
    await t.service.submit('u-1', input, null);
    expect(t.prisma.wellnessProductCheck.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        product: { addedById: 'u-1' },
        NOT: { reasons: { hasSome: ['ai_unavailable', 'user_daily_limit'] } },
      }) as unknown,
    });
  });

  it('гонка двух одинаковых карточек — вторая проверка молча не заводится', async () => {
    const t = setup();
    t.prisma.wellnessProductCheck.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(t.service.submit('u-1', input, null)).resolves.toBe(card);
  });
});

describe('WellnessCheckService.finish — итог и уведомление', () => {
  const accepted: CheckFinish = {
    outcome: 'accepted',
    reasons: [],
    apply: { name: 'Nutella', brand: null, ingredientsRaw: 'сахар, фундук' },
    refined: [],
  };

  it('принято — карточка опубликована из черновика, состав разобран заново', async () => {
    const t = setup();
    await expect(t.service.finish('c-1', accepted)).resolves.toBe(true);
    expect(t.prisma.wellnessProductCheck.updateMany).toHaveBeenCalledWith({
      where: { id: 'c-1', status: 'running' },
      data: expect.objectContaining({
        status: 'accepted',
        labelImageDataUrl: null,
      }) as unknown,
    });
    expect(t.prisma.wellnessProduct.updateMany).toHaveBeenCalledWith({
      where: { id: 'p-1', status: 'draft' },
      data: expect.objectContaining({ status: 'published' }) as unknown,
    });
    expect(t.wellness.storeComposition).toHaveBeenCalledWith(
      'p-1',
      'сахар, фундук',
    );
    expect(t.events[0]).toEqual(
      expect.objectContaining({
        outcome: 'accepted',
        decidedBy: 'ai',
        recipientId: 'u-1',
      }),
    );
  });

  it('уточнено — в карточку пишутся поля ИИ, уведомление их называет', async () => {
    const t = setup();
    await t.service.finish('c-1', {
      outcome: 'refined',
      reasons: [],
      apply: {
        name: 'Nutella паста',
        brand: 'Ferrero',
        ingredientsRaw: 'сахар, фундук, какао',
      },
      refined: ['name', 'brand', 'ingredients'],
    });
    expect(t.prisma.wellnessProduct.updateMany).toHaveBeenCalledWith({
      where: { id: 'p-1', status: 'draft' },
      data: expect.objectContaining({
        status: 'published',
        name: 'Nutella паста',
        brand: 'Ferrero',
        ingredientsRaw: 'сахар, фундук, какао',
      }) as unknown,
    });
    expect(t.wellness.storeComposition).toHaveBeenCalledWith(
      'p-1',
      'сахар, фундук, какао',
    );
    expect(t.events[0]).toEqual(
      expect.objectContaining({
        outcome: 'refined',
        productName: 'Nutella паста',
        refined: ['name', 'brand', 'ingredients'],
      }),
    );
  });

  it('к человеку — карточка не трогается, причины уходят в уведомление', async () => {
    const t = setup();
    await t.service.finish('c-1', {
      outcome: 'review',
      reasons: ['not_found'],
    });
    expect(t.prisma.wellnessProduct.updateMany).not.toHaveBeenCalled();
    expect(t.wellness.storeComposition).not.toHaveBeenCalled();
    expect(t.events[0]).toEqual(
      expect.objectContaining({ outcome: 'review', reasons: ['not_found'] }),
    );
  });

  it('отклонено — карточка снята с причиной', async () => {
    const t = setup();
    await t.service.finish('c-1', {
      outcome: 'rejected',
      reasons: ['not_food'],
    });
    expect(t.prisma.wellnessProduct.updateMany).toHaveBeenCalledWith({
      where: { id: 'p-1', status: 'draft' },
      data: expect.objectContaining({
        status: 'rejected',
        rejectReason: 'Автопроверка: не продукт питания',
      }) as unknown,
    });
    expect(t.events[0]).toEqual(
      expect.objectContaining({ outcome: 'rejected' }),
    );
  });

  it('модератор успел решить сам — его решение остаётся, проверка отменена, тишина', async () => {
    const t = setup();
    t.prisma.wellnessProduct.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(t.service.finish('c-1', accepted)).resolves.toBe(false);
    expect(t.prisma.wellnessProductCheck.update).toHaveBeenCalledWith({
      where: { id: 'c-1' },
      data: { status: 'cancelled' },
    });
    expect(t.events).toEqual([]);
    expect(t.wellness.storeComposition).not.toHaveBeenCalled();
  });

  it('проверку уже закрыл кто-то другой — ничего не пишем и не шлём', async () => {
    const t = setup();
    t.prisma.wellnessProductCheck.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    await expect(t.service.finish('c-1', accepted)).resolves.toBe(false);
    expect(t.prisma.wellnessProduct.updateMany).not.toHaveBeenCalled();
    expect(t.events).toEqual([]);
  });

  it('автора нет (удалил профиль) — итог пишется, слать некому', async () => {
    const t = setup();
    t.prisma.wellnessProductCheck.findUnique.mockResolvedValueOnce({
      id: 'c-1',
      product: { ...card, addedById: null },
    });
    await expect(t.service.finish('c-1', accepted)).resolves.toBe(true);
    expect(t.events).toEqual([]);
  });

  it('данные ИИ и расход сохраняются вместе с итогом', async () => {
    const t = setup();
    await t.service.finish('c-1', {
      outcome: 'review',
      reasons: ['too_few_sources'],
      ai: {
        proposal: {
          found: true,
          notFood: false,
          name: 'Nutella',
          brand: 'Ferrero',
          ingredientsRaw: 'сахар',
          sources: [],
          conflicts: ['вес'],
        },
        sources: [],
        model: 'gpt-5.4',
        usage: { inputTokens: 100, outputTokens: 10 },
        searchCalls: 1,
        costUsdMicros: 10_000,
      },
    });
    expect(t.prisma.wellnessProductCheck.updateMany).toHaveBeenCalledWith({
      where: { id: 'c-1', status: 'running' },
      data: expect.objectContaining({
        aiFound: true,
        aiName: 'Nutella',
        aiConflicts: ['вес'],
        model: 'gpt-5.4',
        inputTokens: 100,
        searchCalls: 1,
        costUsdMicros: 10_000,
      }) as unknown,
    });
  });
});

describe('WellnessCheckService.moderatorDecided', () => {
  it('отменяет незаконченную проверку и сообщает решение словами модератора', async () => {
    const t = setup();
    await t.service.moderatorDecided({
      product: {
        id: 'p-1',
        barcode: card.barcode,
        name: 'Nutella',
        addedById: 'u-1',
      },
      approved: false,
      comment: 'Это таблица калорийности',
    });
    expect(t.prisma.wellnessProductCheck.updateMany).toHaveBeenCalledWith({
      where: { id: 'c-1', status: { in: ['queued', 'running'] } },
      data: expect.objectContaining({
        status: 'cancelled',
        labelImageDataUrl: null,
      }) as unknown,
    });
    expect(t.events[0]).toEqual(
      expect.objectContaining({
        outcome: 'rejected',
        decidedBy: 'moderator',
        comment: 'Это таблица калорийности',
      }),
    );
  });

  it('одобрение — «принято», без автора — без уведомления', async () => {
    const t = setup();
    await t.service.moderatorDecided({
      product: {
        id: 'p-1',
        barcode: card.barcode,
        name: 'Nutella',
        addedById: null,
      },
      approved: true,
      comment: null,
    });
    expect(t.events).toEqual([]);
  });
});
