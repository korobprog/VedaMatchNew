import type { ParsedCheckResponse } from './check-request';
import type { WellnessIngredientEntry } from './ingredient-match';
import { CheckProviderError } from './wellness-ai-check.service';
import type { CheckFinish } from './wellness-check.service';
import {
  LEASE_KEY,
  LEASE_MS,
  PROVIDER_BUSY,
  PROVIDER_BUSY_PAUSE_MS,
  WellnessCheckWorkerService,
} from './wellness-check-worker.service';

/**
 * Воркер проверяется на маленькой базе в памяти, а не на моках с готовыми
 * ответами: клейм через `updateMany` со статусом, ретраи и восстановление
 * зависших — это правила про то, какие строки какой запрос заденет, и
 * проверять их надо тем же фильтром, что уходит в Prisma.
 */

type Row = {
  id: string;
  status: string;
  attemptCount: number;
  errorCode: string | null;
  updatedAt: Date;
  createdAt: Date;
  finishedAt: Date | null;
  model: string | null;
  costUsdMicros: number;
  submittedName: string;
  submittedBrand: string | null;
  submittedIngredients: string;
  labelImageDataUrl: string | null;
  product: { barcode: string; status: string };
};

type Filter = Record<string, unknown>;

function matchesValue(value: unknown, condition: unknown): boolean {
  if (condition === null) return value === null;
  if (condition instanceof Date)
    return (value as Date).getTime() === condition.getTime();
  if (typeof condition !== 'object') return value === condition;
  const ops = condition as Record<string, unknown>;
  return Object.entries(ops).every(([op, arg]) => {
    switch (op) {
      case 'lt':
        return value !== null && (value as number) < (arg as number);
      case 'gte':
        return value !== null && (value as number) >= (arg as number);
      case 'not':
        // Как в SQL: NULL <> 'x' — не истина.
        return value !== null && value !== arg;
      case 'in':
        return (arg as unknown[]).includes(value);
      default:
        throw new Error(`Фильтр ${op} не поддержан тестовой базой`);
    }
  });
}

function matches(row: Row, where: Filter): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR')
      return (condition as Filter[]).some((part) => matches(row, part));
    const value = row[key as keyof Row];
    const comparable = value instanceof Date ? value.getTime() : value;
    const cond =
      condition && typeof condition === 'object' && !(condition instanceof Date)
        ? Object.fromEntries(
            Object.entries(condition as Record<string, unknown>).map(
              ([op, arg]) => [op, arg instanceof Date ? arg.getTime() : arg],
            ),
          )
        : condition;
    return matchesValue(comparable, cond);
  });
}

function createStore(clock: { now: Date }) {
  const rows: Row[] = [];
  const apply = (row: Row, data: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(data)) {
      const current = row[key as keyof Row] as number;
      if (value && typeof value === 'object' && 'increment' in value) {
        (row as Record<string, unknown>)[key] =
          current + (value as { increment: number }).increment;
      } else if (value && typeof value === 'object' && 'decrement' in value) {
        (row as Record<string, unknown>)[key] =
          current - (value as { decrement: number }).decrement;
      } else {
        (row as Record<string, unknown>)[key] = value;
      }
    }
    row.updatedAt = clock.now;
  };
  const table = {
    findFirst: jest.fn(({ where }: { where: Filter }) =>
      Promise.resolve(
        [...rows]
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .find((row) => matches(row, where)) ?? null,
      ),
    ),
    findMany: jest.fn(({ where }: { where: Filter }) =>
      Promise.resolve(rows.filter((row) => matches(row, where))),
    ),
    findUnique: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(rows.find((row) => row.id === where.id) ?? null),
    ),
    updateMany: jest.fn(
      ({ where, data }: { where: Filter; data: Record<string, unknown> }) => {
        const hit = rows.filter((row) => matches(row, where));
        hit.forEach((row) => apply(row, data));
        return Promise.resolve({ count: hit.length });
      },
    ),
    count: jest.fn(({ where }: { where: Filter }) =>
      Promise.resolve(rows.filter((row) => matches(row, where)).length),
    ),
    aggregate: jest.fn(({ where }: { where: Filter }) =>
      Promise.resolve({
        _sum: {
          costUsdMicros: rows
            .filter((row) => matches(row, where))
            .reduce((sum, row) => sum + row.costUsdMicros, 0),
        },
      }),
    ),
  };
  return { rows, table };
}

class FakeRedis {
  status = 'ready';
  readonly keys = new Map<string, string>();
  set = jest.fn(
    (key: string, value: string, _px: string, _ms: number, nx: string) => {
      if (nx === 'NX' && this.keys.has(key)) return Promise.resolve(null);
      this.keys.set(key, value);
      return Promise.resolve('OK');
    },
  );
  eval = jest.fn((_script: string, _n: number, key: string, token: string) => {
    if (this.keys.get(key) === token) this.keys.delete(key);
    return Promise.resolve(1);
  });
}

const COMPOSITION =
  'сахар, масло пальмовое, фундук, какао, молоко сухое, лецитин, ванилин';
const BARCODE = '3017620422003';

const CATALOG: WellnessIngredientEntry[] = [
  { key: 'milk', aliases: ['молоко'], class: 'dairy', severity: 'contains' },
];

function goodResponse(
  extra: Partial<ParsedCheckResponse> = {},
): ParsedCheckResponse {
  return {
    proposal: {
      found: true,
      notFood: false,
      name: 'Nutella',
      brand: 'Ferrero',
      ingredientsRaw: COMPOSITION,
      sources: [
        {
          url: 'https://shop.ru/p/nutella',
          title: 'Nutella',
          confirmsProduct: true,
          confirmsIngredients: true,
        },
        {
          url: 'https://off.org/product/3017620422003',
          title: '',
          confirmsProduct: true,
          confirmsIngredients: false,
        },
      ],
      conflicts: [],
    },
    seenUrls: ['https://off.org/product/3017620422003'],
    searchCalls: 2,
    usage: { inputTokens: 30_000, outputTokens: 500 },
    ...extra,
  };
}

function setup(
  options: { redis?: FakeRedis | null; env?: Record<string, string> } = {},
) {
  const clock = { now: new Date('2026-09-23T10:00:00.000Z') };
  const store = createStore(clock);
  const prisma = { wellnessProductCheck: store.table };
  const finished: Array<{ id: string; result: CheckFinish }> = [];
  const checks = {
    finish: jest.fn((id: string, result: CheckFinish) => {
      const row = store.rows.find((r) => r.id === id);
      if (!row || row.status !== 'running') return Promise.resolve(false);
      row.status = result.outcome;
      row.finishedAt = clock.now;
      row.labelImageDataUrl = null;
      if (result.ai) {
        row.model = result.ai.model;
        row.costUsdMicros = result.ai.costUsdMicros;
      }
      finished.push({ id, result });
      return Promise.resolve(true);
    }),
    cancel: jest.fn((id: string) => {
      const row = store.rows.find((r) => r.id === id);
      if (row) row.status = 'cancelled';
      return Promise.resolve();
    }),
  };
  const ai = {
    check: jest.fn(() => Promise.resolve(goodResponse())),
    model: 'gpt-5.4',
  };
  const pages = {
    fetchText: jest.fn((url: string) =>
      Promise.resolve(
        url === 'https://shop.ru/p/nutella'
          ? `Nutella 350 г. Штрихкод ${BARCODE}. Состав: ${COMPOSITION}.`
          : null,
      ),
    ),
  };
  const wellness = { ingredients: jest.fn(() => Promise.resolve(CATALOG)) };

  const worker = new WellnessCheckWorkerService(
    prisma as never,
    { get: () => undefined } as never,
    wellness as never,
    checks as never,
    ai as never,
    pages as never,
  );
  const redis = options.redis === undefined ? new FakeRedis() : options.redis;
  (worker as unknown as { redis: unknown }).redis = redis;

  const add = (extra: Partial<Row> = {}): Row => {
    const row: Row = {
      id: `c-${store.rows.length + 1}`,
      status: 'queued',
      attemptCount: 0,
      errorCode: null,
      updatedAt: clock.now,
      createdAt: new Date(clock.now.getTime() - 60_000 + store.rows.length),
      finishedAt: null,
      model: null,
      costUsdMicros: 0,
      submittedName: 'Nutella',
      submittedBrand: 'Ferrero',
      submittedIngredients: COMPOSITION,
      labelImageDataUrl: 'data:image/jpeg;base64,AAAA',
      product: { barcode: BARCODE, status: 'draft' },
      ...extra,
    };
    store.rows.push(row);
    return row;
  };
  const tick = () => worker.tick(clock.now);
  return {
    worker,
    store,
    clock,
    checks,
    ai,
    pages,
    redis,
    finished,
    add,
    tick,
  };
}

const ORIGINAL_ENV = process.env;
beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('WELLNESS_')) delete process.env[key];
  }
});
afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('WellnessCheckWorkerService · клейм под лизом', () => {
  it('берёт старейшую карточку из очереди, проверяет и записывает итог', async () => {
    const t = setup();
    const newer = t.add({ createdAt: new Date('2026-09-23T09:59:00Z') });
    const older = t.add({ createdAt: new Date('2026-09-23T09:00:00Z') });

    await t.tick();

    expect(t.ai.check).toHaveBeenCalledTimes(1);
    expect(t.ai.check).toHaveBeenCalledWith({
      barcode: BARCODE,
      name: 'Nutella',
      brand: 'Ferrero',
      ingredientsRaw: COMPOSITION,
      imageDataUrl: 'data:image/jpeg;base64,AAAA',
    });
    expect(older.status).toBe('accepted');
    expect(older.attemptCount).toBe(1);
    expect(newer.status).toBe('queued');
  });

  it('итог — по правилу доверия, с источниками и расходом', async () => {
    process.env.WELLNESS_AI_USD_CENTS_PER_MTOK_IN = '250';
    const t = setup();
    t.add();
    await t.tick();

    const [{ result }] = t.finished;
    expect(result.outcome).toBe('accepted');
    expect(result.ai?.sources.map((s) => s.level)).toEqual([
      'verified',
      'opened',
    ]);
    expect(result.ai?.searchCalls).toBe(2);
    // 30 000 × 2.5$/M = 7.5 цента + 2 поиска по центу.
    expect(result.ai?.costUsdMicros).toBe(95_000);
    expect(t.pages.fetchText).toHaveBeenCalledTimes(2);
  });

  it('за тик — одна карточка: это и есть ограничение частоты платных вызовов', async () => {
    const t = setup();
    t.add();
    t.add();
    await t.tick();
    expect(t.ai.check).toHaveBeenCalledTimes(1);
  });

  it('лиз занят другим процессом — тик ничего не трогает', async () => {
    const redis = new FakeRedis();
    redis.keys.set(LEASE_KEY, 'чужой');
    const t = setup({ redis });
    const row = t.add();
    await t.tick();
    expect(t.ai.check).not.toHaveBeenCalled();
    expect(row.status).toBe('queued');
    expect(redis.keys.get(LEASE_KEY)).toBe('чужой');
  });

  it('лиз берётся с NX и сроком, а после тика снимается своим токеном', async () => {
    const redis = new FakeRedis();
    const t = setup({ redis });
    t.add();
    await t.tick();
    expect(redis.set).toHaveBeenCalledWith(
      LEASE_KEY,
      expect.any(String),
      'PX',
      LEASE_MS,
      'NX',
    );
    expect(redis.keys.has(LEASE_KEY)).toBe(false);
  });

  it('второй тик, пока идёт первый, не начинается', async () => {
    const t = setup();
    t.add();
    t.add();
    let release: () => void = () => undefined;
    t.ai.check.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(goodResponse());
        }),
    );
    const first = t.tick();
    await new Promise((resolve) => setImmediate(resolve));
    await t.tick();
    release();
    await first;
    expect(t.ai.check).toHaveBeenCalledTimes(1);
  });

  it('карточку перехватили между выбором и клеймом — не проверяем её дважды', async () => {
    const t = setup();
    const row = t.add();
    t.store.table.findFirst.mockImplementationOnce(() => {
      row.status = 'running';
      return Promise.resolve(row);
    });
    await t.tick();
    expect(t.ai.check).not.toHaveBeenCalled();
    expect(row.attemptCount).toBe(0);
  });

  it('без Redis работает как одиночный процесс', async () => {
    const t = setup({ redis: null });
    t.add();
    await t.tick();
    expect(t.ai.check).toHaveBeenCalledTimes(1);
  });
});

describe('WellnessCheckWorkerService · ретраи', () => {
  it('сбой провайдера возвращает карточку в очередь с кодом ошибки', async () => {
    const t = setup();
    const row = t.add();
    t.ai.check.mockRejectedValueOnce(
      new CheckProviderError('provider_500: boom', false),
    );
    await t.tick();
    expect(row.status).toBe('queued');
    expect(row.attemptCount).toBe(1);
    expect(row.errorCode).toBe('provider_500: boom');
    expect(t.checks.finish).not.toHaveBeenCalled();
  });

  it('третья неудача — к человеку с причиной ai_failed, четвёртой попытки нет', async () => {
    const t = setup();
    const row = t.add();
    t.ai.check.mockRejectedValue(new Error('timeout'));
    await t.tick();
    await t.tick();
    await t.tick();
    expect(row.attemptCount).toBe(3);
    expect(row.status).toBe('review');
    expect(t.finished[0].result).toEqual(
      expect.objectContaining({
        outcome: 'review',
        reasons: ['ai_failed'],
      }) as unknown,
    );
    await t.tick();
    expect(t.ai.check).toHaveBeenCalledTimes(3);
  });

  it('занятый провайдер попыткой не считается и ждёт паузу', async () => {
    const t = setup();
    const row = t.add();
    t.ai.check.mockRejectedValueOnce(
      new CheckProviderError('provider_429', true),
    );
    await t.tick();
    expect(row.status).toBe('queued');
    expect(row.attemptCount).toBe(0);
    expect(row.errorCode).toBe(PROVIDER_BUSY);

    await t.tick();
    expect(t.ai.check).toHaveBeenCalledTimes(1);

    t.clock.now = new Date(t.clock.now.getTime() + PROVIDER_BUSY_PAUSE_MS + 1);
    await t.tick();
    expect(t.ai.check).toHaveBeenCalledTimes(2);
    expect(row.status).toBe('accepted');
  });

  it('ключ сняли, пока карточка ждала, — сразу к человеку, без ретраев', async () => {
    const t = setup();
    const row = t.add();
    t.ai.check.mockRejectedValueOnce(
      new CheckProviderError('not_configured', false),
    );
    await t.tick();
    expect(row.status).toBe('review');
    expect(t.finished[0].result.reasons).toEqual(['ai_unavailable']);
  });

  it('карточку с исчерпанными попытками из очереди не берёт', async () => {
    const t = setup();
    t.add({ attemptCount: 3 });
    await t.tick();
    expect(t.ai.check).not.toHaveBeenCalled();
  });
});

describe('WellnessCheckWorkerService · зависшие по updatedAt', () => {
  it('упавшая на середине проверка возвращается в очередь и доделывается', async () => {
    const t = setup();
    const stale = t.add({
      status: 'running',
      attemptCount: 1,
      updatedAt: new Date(t.clock.now.getTime() - LEASE_MS - 1),
    });
    await t.tick();
    expect(stale.attemptCount).toBe(2);
    expect(stale.status).toBe('accepted');
  });

  it('свежая «running» — чужая живая работа, её не трогаем', async () => {
    const t = setup();
    const live = t.add({
      status: 'running',
      attemptCount: 1,
      updatedAt: new Date(t.clock.now.getTime() - 60_000),
    });
    await t.tick();
    expect(live.status).toBe('running');
    expect(t.ai.check).not.toHaveBeenCalled();
  });

  it('зависшая на последней попытке — к человеку с уведомлением', async () => {
    const t = setup();
    const stale = t.add({
      status: 'running',
      attemptCount: 3,
      updatedAt: new Date(t.clock.now.getTime() - LEASE_MS - 1),
    });
    await t.tick();
    expect(stale.status).toBe('review');
    expect(t.finished[0].result).toEqual(
      expect.objectContaining({
        reasons: ['ai_failed'],
        errorCode: 'lease_expired',
      }) as unknown,
    );
  });
});

describe('WellnessCheckWorkerService · расходы и отмена', () => {
  it('дневное число проверок выбрано — к человеку без вызова ИИ', async () => {
    process.env.WELLNESS_AI_DAILY_CHECKS = '1';
    const t = setup();
    t.add({ status: 'accepted', model: 'gpt-5.4', finishedAt: t.clock.now });
    const row = t.add();
    await t.tick();
    expect(t.ai.check).not.toHaveBeenCalled();
    expect(row.status).toBe('review');
    expect(t.finished[0].result.reasons).toEqual(['daily_budget']);
  });

  it('дневной бюджет в долларах потрачен — к человеку без вызова ИИ', async () => {
    process.env.WELLNESS_AI_DAILY_BUDGET_CENTS = '10';
    const t = setup();
    t.add({
      status: 'accepted',
      model: 'gpt-5.4',
      finishedAt: t.clock.now,
      costUsdMicros: 100_000,
    });
    t.add();
    await t.tick();
    expect(t.ai.check).not.toHaveBeenCalled();
    expect(t.finished[0].result.reasons).toEqual(['daily_budget']);
  });

  it('вчерашние расходы сегодня не считаются', async () => {
    process.env.WELLNESS_AI_DAILY_CHECKS = '1';
    const t = setup();
    t.add({
      status: 'accepted',
      model: 'gpt-5.4',
      finishedAt: new Date('2026-09-22T23:00:00Z'),
    });
    t.add();
    await t.tick();
    expect(t.ai.check).toHaveBeenCalledTimes(1);
  });

  it('модератор решил раньше очереди — проверка отменяется без вызова ИИ', async () => {
    const t = setup();
    const row = t.add({ product: { barcode: BARCODE, status: 'published' } });
    await t.tick();
    expect(t.ai.check).not.toHaveBeenCalled();
    expect(t.checks.cancel).toHaveBeenCalledWith(row.id);
  });

  it('мусор вместо ответа — к человеку, но потраченное записано', async () => {
    const t = setup();
    t.add();
    t.ai.check.mockResolvedValueOnce(
      goodResponse({ proposal: null, searchCalls: 3 }),
    );
    await t.tick();
    const [{ result }] = t.finished;
    expect(result.outcome).toBe('review');
    expect(result.reasons).toEqual(['ai_unreadable']);
    expect(result.ai?.costUsdMicros).toBe(30_000);
    expect(t.pages.fetchText).not.toHaveBeenCalled();
  });

  it('ИИ не нашёл товар — к человеку, страницы не открываются впустую', async () => {
    const t = setup();
    t.add();
    t.ai.check.mockResolvedValueOnce(
      goodResponse({
        proposal: { ...goodResponse().proposal!, found: false, sources: [] },
      }),
    );
    await t.tick();
    expect(t.finished[0].result.reasons).toEqual(['not_found']);
    expect(t.pages.fetchText).not.toHaveBeenCalled();
  });
});
