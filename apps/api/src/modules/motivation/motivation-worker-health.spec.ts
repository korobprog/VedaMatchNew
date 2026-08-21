import {
  isWorkerAlive,
  MOTIVATION_LEASE_MS,
  stuckSince,
} from './motivation-worker-health';

describe('stuckSince', () => {
  it('отсекает задачи старше срока лиза', () => {
    const now = new Date('2026-08-21T12:00:00.000Z');

    expect(stuckSince(now).toISOString()).toBe('2026-08-21T11:55:00.000Z');
  });

  it('совпадает со сроком, по которому воркер восстанавливает задачи', () => {
    expect(MOTIVATION_LEASE_MS).toBe(5 * 60_000);
  });

  it('принимает свой срок лиза', () => {
    const now = new Date('2026-08-21T12:00:00.000Z');

    expect(stuckSince(now, 60_000).toISOString()).toBe(
      '2026-08-21T11:59:00.000Z',
    );
  });
});

describe('isWorkerAlive', () => {
  const now = new Date('2026-08-21T12:00:00.000Z');

  it('тик минуту назад — воркер жив', () => {
    expect(isWorkerAlive(new Date('2026-08-21T11:59:00.000Z'), now)).toBe(true);
  });

  it('тик старше срока лиза — воркер молчит', () => {
    expect(isWorkerAlive(new Date('2026-08-21T11:54:00.000Z'), now)).toBe(
      false,
    );
  });

  it('тика не было вовсе — воркер молчит', () => {
    expect(isWorkerAlive(null, now)).toBe(false);
  });
});
