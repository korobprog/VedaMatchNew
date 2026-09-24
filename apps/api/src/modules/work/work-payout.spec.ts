import type { WorkFinanceRules } from './work-finance';
import {
  type WorkPayoutSchedule,
  workBuildPayout,
  workCurrentPeriod,
  workNextPayoutDay,
  workPeriodDue,
  workWeekday,
} from './work-payout';

const weeklyFriday: WorkPayoutSchedule = {
  period: 'weekly',
  payoutDay: 5,
  anchorDay: '2026-09-25',
};

describe('календарь выплат', () => {
  it('день недели ISO', () => {
    expect(workWeekday('2026-09-21')).toBe(1); // понедельник
    expect(workWeekday('2026-09-27')).toBe(7); // воскресенье
  });

  it('раз в неделю — ближайшая пятница, сама пятница подходит', () => {
    expect(workNextPayoutDay('2026-09-22', weeklyFriday)).toBe('2026-09-25');
    expect(workNextPayoutDay('2026-09-25', weeklyFriday)).toBe('2026-09-25');
    expect(workNextPayoutDay('2026-09-26', weeklyFriday)).toBe('2026-10-02');
  });

  it('раз в две недели — только пятницы через одну от якоря', () => {
    const biweekly = { ...weeklyFriday, period: 'biweekly' as const };
    expect(workNextPayoutDay('2026-09-26', biweekly)).toBe('2026-10-09');
    expect(workNextPayoutDay('2026-09-20', biweekly)).toBe('2026-09-25');
    // До якоря чётность та же.
    expect(workNextPayoutDay('2026-09-05', biweekly)).toBe('2026-09-11');
  });

  it('раз в месяц — число месяца, через год', () => {
    const monthly = {
      ...weeklyFriday,
      period: 'monthly' as const,
      payoutDay: 10,
    };
    expect(workNextPayoutDay('2026-09-01', monthly)).toBe('2026-09-10');
    expect(workNextPayoutDay('2026-09-10', monthly)).toBe('2026-09-10');
    expect(workNextPayoutDay('2026-12-11', monthly)).toBe('2027-01-10');
  });

  it('текущий период — с дня после прошлого по ближайший день подбития', () => {
    expect(workCurrentPeriod(null, '2026-09-23', weeklyFriday)).toEqual({
      fromDay: '2026-09-23',
      toDay: '2026-09-25',
    });
    expect(workCurrentPeriod('2026-09-25', '2026-09-01', weeklyFriday)).toEqual(
      { fromDay: '2026-09-26', toDay: '2026-10-02' },
    );
  });

  it('подбили раньше срока — расписание не сдвигается', () => {
    // Подбили в среду 30.09; следующий период — с четверга по пятницу 2.10.
    expect(workCurrentPeriod('2026-09-30', '2026-09-01', weeklyFriday)).toEqual(
      { fromDay: '2026-10-01', toDay: '2026-10-02' },
    );
  });

  it('пора подбивать, когда день подбития прошёл целиком', () => {
    expect(workPeriodDue('2026-09-25', '2026-09-25')).toBe(false);
    expect(workPeriodDue('2026-09-25', '2026-09-26')).toBe(true);
  });
});

describe('подбитие периода', () => {
  const rules: WorkFinanceRules = {
    pricingModel: 'hourly',
    rateMinor: 150_000,
    dailyNormMinutes: 180,
    overtimeRateMinor: 225_000,
    overtimeMode: 'on_request',
    timezone: 'Europe/Moscow',
  };
  const split = (normal: number, overtime: number, approved = 0) => ({
    minutes: normal + overtime,
    normalMinutes: normal,
    overtimeMinutes: overtime,
    approvedOvertimeMinutes: approved,
  });

  const payout = workBuildPayout({
    fromDay: '2026-09-19',
    rules,
    entries: [
      {
        userId: 'g',
        personName: 'Говинда',
        taskId: 't1',
        taskKey: 'SA-1',
        taskTitle: 'Вёрстка',
        day: '2026-09-22',
        split: split(180, 120, 60),
      },
      {
        userId: 'r',
        personName: 'Радха',
        taskId: 't2',
        taskKey: 'SA-2',
        taskTitle: 'Главная',
        day: '2026-09-23',
        split: split(120, 0),
      },
      {
        // Внесено задним числом в уже подбитый день.
        userId: 'g',
        personName: 'Говинда',
        taskId: 't2',
        taskKey: 'SA-2',
        taskTitle: 'Главная',
        day: '2026-09-15',
        split: split(60, 0),
      },
    ],
    lateApprovals: [
      {
        userId: 'r',
        personName: 'Радха',
        taskKey: 'SA-1',
        day: '2026-09-12',
        minutes: 60,
      },
    ],
    lines: [
      {
        taskId: 't1',
        taskKey: 'SA-1',
        taskTitle: 'Вёрстка',
        kind: 'expense',
        amountMinor: 120_000,
      },
      {
        taskId: 't1',
        taskKey: 'SA-1',
        taskTitle: 'Вёрстка',
        kind: 'discount',
        amountMinor: 20_000,
      },
    ],
    prices: [],
    doneTaskIds: new Set(['t1']),
  });

  it('кому сколько: норма, одобренное сверх, доплата задним числом', () => {
    expect(payout.people).toEqual([
      {
        userId: 'g',
        name: 'Говинда',
        minutes: 360,
        normalMinutes: 240,
        overtimeMinutes: 60,
        pendingOvertimeMinutes: 60,
        // 4 ч × 1500 + 1 ч × 2250
        workMinor: 600_000 + 225_000,
      },
      {
        userId: 'r',
        name: 'Радха',
        minutes: 120,
        normalMinutes: 120,
        overtimeMinutes: 60,
        pendingOvertimeMinutes: 0,
        // 2 ч × 1500 + доплата 1 ч × 2250
        workMinor: 300_000 + 225_000,
      },
    ]);
  });

  it('что сделано: задачи по номеру, закрытые отмечены', () => {
    expect(
      payout.tasks.map((task) => [task.key, task.done, task.minutes]),
    ).toEqual([
      ['SA-1', true, 300],
      ['SA-2', false, 180],
    ]);
  });

  it('корректировки: опоздавшее время и одобрение задним числом', () => {
    expect(
      payout.corrections.map((row) => [row.kind, row.name, row.amountMinor]),
    ).toEqual([
      ['late_time', 'Говинда', 150_000],
      ['late_approval', 'Радха', 225_000],
    ]);
  });

  it('итог: работа с доплатой, расходы, скидка', () => {
    expect(payout.totals).toMatchObject({
      workMinor: 825_000 + 525_000,
      expensesMinor: 120_000,
      discountMinor: 20_000,
      correctionsMinor: 225_000,
      totalMinor: 1_350_000 + 100_000,
    });
  });

  it('фикс за задачу: деньги — цена закрытой задачи, часы — для сведения', () => {
    const fixed = workBuildPayout({
      fromDay: '2026-09-19',
      rules: { ...rules, pricingModel: 'fixed' },
      entries: [
        {
          userId: 'g',
          personName: 'Говинда',
          taskId: 't1',
          taskKey: 'SA-1',
          taskTitle: 'Вёрстка',
          day: '2026-09-22',
          split: split(180, 0),
        },
      ],
      lateApprovals: [],
      lines: [],
      prices: [
        {
          taskId: 't1',
          taskKey: 'SA-1',
          taskTitle: 'Вёрстка',
          priceMinor: 1_200_000,
        },
      ],
      doneTaskIds: new Set(['t1']),
    });
    expect(fixed.people[0].workMinor).toBe(0);
    expect(fixed.totals.totalMinor).toBe(1_200_000);
  });
});
