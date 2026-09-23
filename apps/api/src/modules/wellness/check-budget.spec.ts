import {
  admitToQueue,
  admitToRun,
  checkCostUsdMicros,
  readCheckSettings,
  startOfUtcDay,
} from './check-budget';

describe('readCheckSettings', () => {
  it('без переменных — включено, с лимитами по умолчанию', () => {
    expect(readCheckSettings({})).toEqual({
      enabled: true,
      model: 'gpt-5.4',
      rates: { inCentsPerMtok: 0, outCentsPerMtok: 0, centsPerSearch: 1 },
      dailyBudgetUsdMicros: 3_000_000,
      dailyChecks: 40,
      userDailyChecks: 5,
    });
  });

  it('WELLNESS_AUTO_CHECK=0 выключает', () => {
    expect(readCheckSettings({ WELLNESS_AUTO_CHECK: '0' }).enabled).toBe(false);
    expect(readCheckSettings({ WELLNESS_AUTO_CHECK: '1' }).enabled).toBe(true);
  });

  it('пустая строка из compose — «не задано», а не ноль', () => {
    const settings = readCheckSettings({
      WELLNESS_AI_DAILY_CHECKS: '',
      WELLNESS_AI_USER_DAILY_CHECKS: '  ',
      WELLNESS_SEARCH_MODEL: '',
    });
    expect(settings.dailyChecks).toBe(40);
    expect(settings.userDailyChecks).toBe(5);
    expect(settings.model).toBe('gpt-5.4');
  });

  it('мусор и отрицательные значения не ломают лимит', () => {
    const settings = readCheckSettings({
      WELLNESS_AI_DAILY_CHECKS: 'много',
      WELLNESS_AI_DAILY_BUDGET_CENTS: '-5',
    });
    expect(settings.dailyChecks).toBe(40);
    expect(settings.dailyBudgetUsdMicros).toBe(3_000_000);
  });

  it('заданные цены и лимиты читаются', () => {
    const settings = readCheckSettings({
      WELLNESS_SEARCH_MODEL: 'gpt-5.5',
      WELLNESS_AI_USD_CENTS_PER_MTOK_IN: '250',
      WELLNESS_AI_USD_CENTS_PER_MTOK_OUT: '1500',
      WELLNESS_AI_USD_CENTS_PER_SEARCH: '2.5',
      WELLNESS_AI_DAILY_BUDGET_CENTS: '100',
      WELLNESS_AI_DAILY_CHECKS: '10',
      WELLNESS_AI_USER_DAILY_CHECKS: '0',
    });
    expect(settings).toEqual({
      enabled: true,
      model: 'gpt-5.5',
      rates: {
        inCentsPerMtok: 250,
        outCentsPerMtok: 1500,
        centsPerSearch: 2.5,
      },
      dailyBudgetUsdMicros: 1_000_000,
      dailyChecks: 10,
      userDailyChecks: 0,
    });
  });
});

describe('checkCostUsdMicros', () => {
  const rates = {
    inCentsPerMtok: 250,
    outCentsPerMtok: 1500,
    centsPerSearch: 1,
  };

  it('живая проба: 37 410 входных, 380 выходных, один поиск ≈ 10.9 цента', () => {
    // 37410 × 2.5$/M = 0.0935$, 380 × 15$/M = 0.0057$, поиск 0.01$.
    expect(
      checkCostUsdMicros({ inputTokens: 37_410, outputTokens: 380 }, 1, rates),
    ).toBe(109_225);
  });

  it('без цен считается только поиск', () => {
    expect(
      checkCostUsdMicros(
        { inputTokens: 1_000_000, outputTokens: 1_000_000 },
        3,
        { inCentsPerMtok: 0, outCentsPerMtok: 0, centsPerSearch: 1 },
      ),
    ).toBe(30_000);
  });
});

describe('admitToQueue', () => {
  const settings = readCheckSettings({});

  it('всё настроено и лимит человека не выбран — в очередь', () => {
    expect(
      admitToQueue({ settings, providerConfigured: true, userChecksToday: 4 }),
    ).toBeNull();
  });

  it('выключено или нет ключа — сразу человеку', () => {
    expect(
      admitToQueue({
        settings: { ...settings, enabled: false },
        providerConfigured: true,
        userChecksToday: 0,
      }),
    ).toBe('ai_unavailable');
    expect(
      admitToQueue({ settings, providerConfigured: false, userChecksToday: 0 }),
    ).toBe('ai_unavailable');
  });

  it('пятая карточка за сутки проверяется, шестая — человеку', () => {
    expect(
      admitToQueue({ settings, providerConfigured: true, userChecksToday: 5 }),
    ).toBe('user_daily_limit');
  });
});

describe('admitToRun', () => {
  const settings = readCheckSettings({});

  it('до лимитов — можно', () => {
    expect(
      admitToRun({
        settings,
        spentTodayUsdMicros: 2_999_999,
        checksRunToday: 39,
      }),
    ).toBeNull();
  });

  it('число проверок за сутки держит бюджет даже без цен', () => {
    expect(
      admitToRun({ settings, spentTodayUsdMicros: 0, checksRunToday: 40 }),
    ).toBe('daily_budget');
  });

  it('потраченный бюджет останавливает', () => {
    expect(
      admitToRun({
        settings,
        spentTodayUsdMicros: 3_000_000,
        checksRunToday: 0,
      }),
    ).toBe('daily_budget');
  });

  it('нулевой бюджет в долларах — без денежного лимита', () => {
    expect(
      admitToRun({
        settings: { ...settings, dailyBudgetUsdMicros: 0 },
        spentTodayUsdMicros: 9_999_999,
        checksRunToday: 0,
      }),
    ).toBeNull();
  });
});

describe('startOfUtcDay', () => {
  it('полночь по UTC того же дня', () => {
    expect(
      startOfUtcDay(new Date('2026-09-23T23:59:59.999Z')).toISOString(),
    ).toBe('2026-09-23T00:00:00.000Z');
  });
});
