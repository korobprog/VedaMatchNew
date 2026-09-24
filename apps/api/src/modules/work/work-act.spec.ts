import type { WorkPayoutSnapshot } from '@vedamatch/shared';
import {
  workActFromSnapshot,
  workDaysSince,
  workReminderDue,
} from './work-act';

const snapshot: WorkPayoutSnapshot = {
  people: [
    {
      userId: 'g',
      name: 'Говинда',
      minutes: 300,
      normalMinutes: 180,
      overtimeMinutes: 60,
      pendingOvertimeMinutes: 60,
      workMinor: 705_000,
    },
  ],
  tasks: [
    {
      taskId: 't1',
      key: 'SA-1',
      title: 'Вёрстка',
      done: true,
      minutes: 300,
      workMinor: 480_000,
      expensesMinor: 120_000,
      discountMinor: 20_000,
    },
  ],
  corrections: [],
  totals: {
    minutes: 300,
    normalMinutes: 180,
    overtimeMinutes: 60,
    pendingOvertimeMinutes: 60,
    workMinor: 705_000,
    expensesMinor: 120_000,
    discountMinor: 20_000,
    correctionsMinor: 225_000,
    totalMinor: 805_000,
  },
};

describe('акт для клиента', () => {
  it('строки по задачам с итогом, без сумм исполнителей', () => {
    const act = workActFromSnapshot(snapshot);
    expect(act.lines).toEqual([
      {
        key: 'SA-1',
        title: 'Вёрстка',
        done: true,
        minutes: 300,
        workMinor: 480_000,
        expensesMinor: 120_000,
        discountMinor: 20_000,
        totalMinor: 580_000,
      },
    ]);
    expect(act.correctionsMinor).toBe(225_000);
    expect(act.totals.totalMinor).toBe(805_000);
    expect(JSON.stringify(act)).not.toContain('Говинда');
  });
});

describe('напоминание об оплате', () => {
  const closedAt = new Date('2026-09-25T20:00:00Z');
  const at = (iso: string) => new Date(iso);

  it('через N суток после подбития, потом раз в N суток', () => {
    const base = { days: 3, closedAt, totalMinor: 100, remindedAt: null };
    expect(workReminderDue({ ...base, now: at('2026-09-28T19:59:00Z') })).toBe(
      false,
    );
    expect(workReminderDue({ ...base, now: at('2026-09-28T20:00:00Z') })).toBe(
      true,
    );
    expect(
      workReminderDue({
        ...base,
        remindedAt: at('2026-09-28T20:00:00Z'),
        now: at('2026-09-30T20:00:00Z'),
      }),
    ).toBe(false);
    expect(
      workReminderDue({
        ...base,
        remindedAt: at('2026-09-28T20:00:00Z'),
        now: at('2026-10-01T20:00:00Z'),
      }),
    ).toBe(true);
  });

  it('ноль дней и пустой период — не напоминать', () => {
    const now = at('2026-12-01T00:00:00Z');
    expect(
      workReminderDue({
        days: 0,
        closedAt,
        remindedAt: null,
        totalMinor: 100,
        now,
      }),
    ).toBe(false);
    expect(
      workReminderDue({
        days: 3,
        closedAt,
        remindedAt: null,
        totalMinor: 0,
        now,
      }),
    ).toBe(false);
  });

  it('сколько суток прошло', () => {
    expect(workDaysSince(closedAt, at('2026-09-29T21:00:00Z'))).toBe(4);
  });
});
