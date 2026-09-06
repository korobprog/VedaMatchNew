import {
  costOf,
  decide,
  isHalted,
  messagesLeft,
  overBudget,
  reasonText,
  usageDay,
} from './assistant-quota';

const settings = {
  enabled: true,
  aiEnabled: true,
  dailyMessagesPerUser: 10,
  dailyTokensPerUser: 1_000,
  dailyTokenBudget: 10_000,
  dailyCostLimitUsdCents: 0,
};

describe('decide', () => {
  it('разрешает, когда всё включено и лимиты не исчерпаны', () => {
    expect(
      decide({ settings, configured: true, usage: null, budget: null }),
    ).toEqual({ allowed: true });
  });

  it('выключатели старше квот: сначала enabled, потом aiEnabled, потом ключ', () => {
    expect(
      decide({
        settings: { ...settings, enabled: false },
        configured: true,
        usage: null,
        budget: null,
      }),
    ).toEqual({ allowed: false, reason: 'disabled' });
    expect(
      decide({
        settings: { ...settings, aiEnabled: false },
        configured: false,
        usage: null,
        budget: null,
      }),
    ).toEqual({ allowed: false, reason: 'ai_unavailable' });
    expect(
      decide({ settings, configured: false, usage: null, budget: null }),
    ).toEqual({ allowed: false, reason: 'not_configured' });
  });

  it('исчерпанный бюджет портала останавливает всех', () => {
    const budget = {
      tokensIn: 9_000,
      tokensOut: 1_000,
      costUsdCents: 0,
      haltedAt: null,
    };
    expect(decide({ settings, configured: true, usage: null, budget })).toEqual(
      { allowed: false, reason: 'budget_halted' },
    );
  });

  it('снятая вручную остановка не помогает, пока расход за лимитом', () => {
    expect(
      isHalted(settings, {
        tokensIn: 10_000,
        tokensOut: 0,
        costUsdCents: 0,
        haltedAt: null,
      }),
    ).toBe(true);
    expect(
      isHalted(settings, {
        tokensIn: 1,
        tokensOut: 0,
        costUsdCents: 0,
        haltedAt: new Date(),
      }),
    ).toBe(true);
    expect(isHalted(settings, null)).toBe(false);
  });

  it('личные лимиты: сообщения, потом токены; ноль — без лимита', () => {
    expect(
      decide({
        settings,
        configured: true,
        usage: { messages: 10, tokensIn: 0, tokensOut: 0 },
        budget: null,
      }),
    ).toEqual({ allowed: false, reason: 'messages_exhausted' });
    expect(
      decide({
        settings,
        configured: true,
        usage: { messages: 1, tokensIn: 600, tokensOut: 400 },
        budget: null,
      }),
    ).toEqual({ allowed: false, reason: 'tokens_exhausted' });
    expect(
      decide({
        settings: {
          ...settings,
          dailyMessagesPerUser: 0,
          dailyTokensPerUser: 0,
        },
        configured: true,
        usage: { messages: 999, tokensIn: 999_999, tokensOut: 0 },
        budget: null,
      }),
    ).toEqual({ allowed: true });
  });

  it('денежный лимит работает только когда задан', () => {
    const budget = {
      tokensIn: 1,
      tokensOut: 1,
      costUsdCents: 500,
      haltedAt: null,
    };
    expect(overBudget(settings, budget)).toBe(false);
    expect(
      overBudget({ ...settings, dailyCostLimitUsdCents: 500 }, budget),
    ).toBe(true);
  });
});

describe('messagesLeft и тексты', () => {
  it('считает остаток и не уходит в минус', () => {
    expect(
      messagesLeft(settings, { messages: 3, tokensIn: 0, tokensOut: 0 }),
    ).toBe(7);
    expect(
      messagesLeft(settings, { messages: 30, tokensIn: 0, tokensOut: 0 }),
    ).toBe(0);
    expect(messagesLeft({ ...settings, dailyMessagesPerUser: 0 }, null)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it('у каждой причины есть объяснение человеку', () => {
    for (const reason of [
      'disabled',
      'ai_unavailable',
      'not_configured',
      'budget_halted',
      'messages_exhausted',
      'tokens_exhausted',
    ] as const)
      expect(reasonText(reason).length).toBeGreaterThan(10);
  });
});

describe('costOf и usageDay', () => {
  it('стоимость в центах по ценам за миллион токенов; без цен — ноль', () => {
    expect(
      costOf(
        { tokensIn: 1_000_000, tokensOut: 500_000 },
        { inCentsPerMtok: 10, outCentsPerMtok: 40 },
      ),
    ).toBe(30);
    expect(
      costOf(
        { tokensIn: 1_000_000, tokensOut: 0 },
        { inCentsPerMtok: 0, outCentsPerMtok: 0 },
      ),
    ).toBe(0);
    expect(
      costOf(
        { tokensIn: 1, tokensOut: 1 },
        { inCentsPerMtok: NaN, outCentsPerMtok: 1 },
      ),
    ).toBe(0);
  });

  it('день расхода — календарный день в UTC', () => {
    expect(usageDay(new Date('2026-09-06T23:59:00Z')).toISOString()).toBe(
      '2026-09-06T00:00:00.000Z',
    );
    expect(usageDay(new Date('2026-09-07T00:01:00Z')).toISOString()).toBe(
      '2026-09-07T00:00:00.000Z',
    );
  });
});
