import {
  type WorkFinanceRules,
  workAllowanceFrom,
  workClassifySpans,
  workDaysInclusive,
  workOvertimeRequestMaxCost,
  workEstimateCost,
  workLocalDay,
  workMinutesCost,
  workNextLocalMidnight,
  workSplitByLocalDay,
  workTaskTotals,
} from './work-finance';

const MSK = 'Europe/Moscow';

const hourly: WorkFinanceRules = {
  pricingModel: 'hourly',
  rateMinor: 150_000, // 1500 ₽/ч
  dailyNormMinutes: 180,
  overtimeRateMinor: 225_000, // 2250 ₽/ч
  overtimeMode: 'auto',
  timezone: MSK,
};

/** Время по Москве (UTC+3) строкой — читается легче, чем Date.UTC. */
const msk = (local: string) => new Date(`${local}+03:00`);

const span = (id: string, userId: string | null, from: string, to: string) => ({
  id,
  userId,
  startedAt: msk(from),
  endedAt: msk(to),
});

describe('сутки в поясе доски', () => {
  it('день берётся по поясу, а не по UTC', () => {
    // 01:30 по Москве — это ещё 22:30 предыдущего дня по UTC.
    expect(workLocalDay(msk('2026-09-24T01:30:00'), MSK)).toBe('2026-09-24');
    expect(workLocalDay(msk('2026-09-24T01:30:00'), 'UTC')).toBe('2026-09-23');
  });

  it('ближайшая полночь — начало следующих суток пояса', () => {
    expect(
      workNextLocalMidnight(msk('2026-09-24T15:00:00'), MSK).toISOString(),
    ).toBe(msk('2026-09-25T00:00:00').toISOString());
  });

  it('полночь в поясе с переходом на летнее время', () => {
    // В Берлине 29.03.2026 часы переводятся вперёд, и полночь 30.03 — это
    // уже UTC+2.
    expect(
      workNextLocalMidnight(
        new Date('2026-03-29T12:00:00+02:00'),
        'Europe/Berlin',
      ).toISOString(),
    ).toBe('2026-03-29T22:00:00.000Z');
  });

  it('запись через полночь делится на два дня', () => {
    expect(
      workSplitByLocalDay(
        msk('2026-09-24T23:00:00'),
        msk('2026-09-25T01:30:00'),
        MSK,
      ),
    ).toEqual([
      { day: '2026-09-24', ms: 60 * 60_000 },
      { day: '2026-09-25', ms: 90 * 60_000 },
    ]);
  });
});

describe('норма и сверх нормы', () => {
  it('первые три часа дня — норма, остальное сверх', () => {
    const splits = workClassifySpans(
      [span('a', 'u1', '2026-09-24T10:00:00', '2026-09-24T15:00:00')],
      180,
      MSK,
    );
    expect(splits.get('a')).toEqual({
      minutes: 300,
      normalMinutes: 180,
      overtimeMinutes: 120,
      approvedOvertimeMinutes: 0,
    });
  });

  it('норма общая на день по всем задачам, по времени начала', () => {
    const splits = workClassifySpans(
      [
        // Порядок во входе нарочно перепутан.
        span('late', 'u1', '2026-09-24T14:00:00', '2026-09-24T16:00:00'),
        span('early', 'u1', '2026-09-24T09:00:00', '2026-09-24T11:00:00'),
      ],
      180,
      MSK,
    );
    expect(splits.get('early')).toMatchObject({
      normalMinutes: 120,
      overtimeMinutes: 0,
    });
    expect(splits.get('late')).toMatchObject({
      normalMinutes: 60,
      overtimeMinutes: 60,
    });
  });

  it('у каждого исполнителя своя норма', () => {
    const splits = workClassifySpans(
      [
        span('a', 'u1', '2026-09-24T09:00:00', '2026-09-24T12:00:00'),
        span('b', 'u2', '2026-09-24T09:00:00', '2026-09-24T12:00:00'),
      ],
      180,
      MSK,
    );
    expect(splits.get('a')?.overtimeMinutes).toBe(0);
    expect(splits.get('b')?.overtimeMinutes).toBe(0);
  });

  it('новый день — новая норма, даже внутри одной записи', () => {
    // 22:00–04:00: два часа в одном дне и четыре в следующем.
    const splits = workClassifySpans(
      [span('night', 'u1', '2026-09-24T22:00:00', '2026-09-25T04:00:00')],
      180,
      MSK,
    );
    expect(splits.get('night')).toEqual({
      minutes: 360,
      normalMinutes: 300,
      overtimeMinutes: 60,
      approvedOvertimeMinutes: 0,
    });
  });

  it('норма 0 — сверх нормы не бывает', () => {
    const splits = workClassifySpans(
      [span('a', 'u1', '2026-09-24T08:00:00', '2026-09-24T20:00:00')],
      0,
      MSK,
    );
    expect(splits.get('a')?.overtimeMinutes).toBe(0);
  });

  it('норма и сверх складываются ровно в длину записи', () => {
    const splits = workClassifySpans(
      [
        span('a', 'u1', '2026-09-24T09:00:20', '2026-09-24T11:59:50'),
        span('b', 'u1', '2026-09-24T12:00:10', '2026-09-24T12:40:40'),
      ],
      180,
      MSK,
    );
    for (const split of splits.values()) {
      expect(split.normalMinutes + split.overtimeMinutes).toBe(split.minutes);
    }
  });
});

describe('деньги', () => {
  it('минуты по часовой ставке — до копейки', () => {
    expect(workMinutesCost(90, 150_000)).toBe(225_000);
    expect(workMinutesCost(1, 100_000)).toBe(1667);
  });

  const splits = [
    {
      minutes: 300,
      normalMinutes: 180,
      overtimeMinutes: 120,
      approvedOvertimeMinutes: 0,
    },
  ];

  it('почасовая, сверх нормы автоматически', () => {
    const totals = workTaskTotals(splits, [], hourly, null);
    // 3 ч × 1500 + 2 ч × 2250
    expect(totals.workMinor).toBe(450_000 + 450_000);
    expect(totals.pendingOvertimeMinutes).toBe(0);
  });

  it('сверх нормы по запросу — видно, но в счёт не идёт', () => {
    const totals = workTaskTotals(
      splits,
      [],
      { ...hourly, overtimeMode: 'on_request' },
      null,
    );
    expect(totals.workMinor).toBe(450_000);
    expect(totals.pendingOvertimeMinutes).toBe(120);
  });

  it('расходы прибавляются, скидка вычитается, но не ниже нуля', () => {
    const totals = workTaskTotals(
      splits,
      [
        { kind: 'expense', amountMinor: 120_000 },
        { kind: 'discount', amountMinor: 20_000 },
      ],
      hourly,
      null,
    );
    expect(totals.totalMinor).toBe(900_000 + 120_000 - 20_000);

    const zero = workTaskTotals(
      [],
      [{ kind: 'discount', amountMinor: 500 }],
      hourly,
      null,
    );
    expect(zero.totalMinor).toBe(0);
  });

  it('фикс за задачу — время учитывается, деньги несёт цена', () => {
    const fixed = { ...hourly, pricingModel: 'fixed' as const };
    const totals = workTaskTotals(splits, [], fixed, 1_200_000);
    expect(totals.minutes).toBe(300);
    expect(totals.workMinor).toBe(1_200_000);
    expect(totals.pendingOvertimeMinutes).toBe(0);
  });

  it('оценка деньгами', () => {
    expect(workEstimateCost(480, null, hourly)).toBe(1_200_000);
    expect(workEstimateCost(null, null, hourly)).toBeNull();
    expect(
      workEstimateCost(480, 99_900, { ...hourly, pricingModel: 'fixed' }),
    ).toBe(99_900);
  });
});

describe('одобренное сверх нормы (VED-459)', () => {
  const onRequest = { ...hourly, overtimeMode: 'on_request' as const };

  it('разрешение складывается по запросам и действует только в свои дни', () => {
    const allowance = workAllowanceFrom([
      {
        userId: 'u1',
        fromDay: '2026-09-22',
        toDay: '2026-09-26',
        minutesPerDay: 60,
      },
      {
        userId: 'u1',
        fromDay: '2026-09-24',
        toDay: '2026-09-24',
        minutesPerDay: 30,
      },
      {
        userId: 'u2',
        fromDay: '2026-09-24',
        toDay: '2026-09-24',
        minutesPerDay: 600,
      },
    ]);
    expect(allowance('u1', '2026-09-24')).toBe(90);
    expect(allowance('u1', '2026-09-26')).toBe(60);
    expect(allowance('u1', '2026-09-27')).toBe(0);
    expect(allowance(null, '2026-09-24')).toBe(0);
  });

  it('одобренный час из двух сверх нормы — в счёт идёт час', () => {
    const splits = workClassifySpans(
      [span('a', 'u1', '2026-09-24T10:00:00', '2026-09-24T15:00:00')],
      180,
      MSK,
      workAllowanceFrom([
        {
          userId: 'u1',
          fromDay: '2026-09-24',
          toDay: '2026-09-24',
          minutesPerDay: 60,
        },
      ]),
    );
    const split = splits.get('a');
    expect(split).toEqual({
      minutes: 300,
      normalMinutes: 180,
      overtimeMinutes: 120,
      approvedOvertimeMinutes: 60,
    });
    const totals = workTaskTotals([split!], [], onRequest, null);
    // 3 ч × 1500 + 1 ч × 2250; второй час сверх нормы ждёт одобрения.
    expect(totals.workMinor).toBe(450_000 + 225_000);
    expect(totals.pendingOvertimeMinutes).toBe(60);
  });

  it('одобренное тратится по времени начала на всю доску за день', () => {
    const splits = workClassifySpans(
      [
        span('a', 'u1', '2026-09-24T09:00:00', '2026-09-24T13:00:00'),
        span('b', 'u1', '2026-09-24T14:00:00', '2026-09-24T15:00:00'),
      ],
      180,
      MSK,
      workAllowanceFrom([
        {
          userId: 'u1',
          fromDay: '2026-09-24',
          toDay: '2026-09-24',
          minutesPerDay: 90,
        },
      ]),
    );
    // Час сверх нормы в «a» одобрен целиком, из часа в «b» — половина.
    expect(splits.get('a')?.approvedOvertimeMinutes).toBe(60);
    expect(splits.get('b')?.approvedOvertimeMinutes).toBe(30);
  });

  it('в режиме «автоматически» одобрение не нужно', () => {
    const [split] = workClassifySpans(
      [span('a', 'u1', '2026-09-24T10:00:00', '2026-09-24T15:00:00')],
      180,
      MSK,
    ).values();
    const totals = workTaskTotals([split], [], hourly, null);
    expect(totals.workMinor).toBe(450_000 + 450_000);
    expect(totals.pendingOvertimeMinutes).toBe(0);
  });

  it('потолок запроса — все дни целиком по ставке сверх нормы', () => {
    expect(workDaysInclusive('2026-09-24', '2026-09-24')).toBe(1);
    expect(workDaysInclusive('2026-09-28', '2026-10-02')).toBe(5);
    // 2 ч в день × 5 дней × 2250
    expect(
      workOvertimeRequestMaxCost(120, '2026-09-28', '2026-10-02', 225_000),
    ).toBe(2_250_000);
  });
});
