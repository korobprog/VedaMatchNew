import {
  DEFAULT_GRACE_DAYS,
  dayStart,
  graceDays,
  momentExpiresAt,
  purgeCutoff,
} from './moments-lifetime';

describe('сроки момента', () => {
  it('момент живёт ровно сутки', () => {
    const now = new Date('2026-09-06T12:00:00.000Z');
    expect(momentExpiresAt(now).toISOString()).toBe('2026-09-07T12:00:00.000Z');
  });

  it('сутки считаются в миллисекундах, а не в календарных днях', () => {
    // Ночь перехода на летнее время в Европе: календарные сутки короче,
    // но обещание «момент виден 24 часа» от часового пояса не зависит.
    const now = new Date('2026-03-29T00:30:00.000Z');
    expect(momentExpiresAt(now).getTime() - now.getTime()).toBe(24 * 3600_000);
  });

  it('граница уборки отстоит от сейчас на отсрочку', () => {
    const now = new Date('2026-09-10T00:00:00.000Z');
    expect(purgeCutoff(now, 7).toISOString()).toBe('2026-09-03T00:00:00.000Z');
  });

  it('мусор в окружении даёт умолчание', () => {
    expect(graceDays(undefined)).toBe(DEFAULT_GRACE_DAYS);
    expect(graceDays('')).toBe(DEFAULT_GRACE_DAYS);
    expect(graceDays('нисколько')).toBe(DEFAULT_GRACE_DAYS);
    expect(graceDays('0')).toBe(DEFAULT_GRACE_DAYS);
    expect(graceDays('1000')).toBe(DEFAULT_GRACE_DAYS);
  });

  it('разумное значение из окружения принимается', () => {
    expect(graceDays('3')).toBe(3);
    expect(graceDays('3.4')).toBe(3);
  });

  it('окно суточного лимита — скользящие сутки назад', () => {
    const now = new Date('2026-09-06T12:00:00.000Z');
    expect(dayStart(now).toISOString()).toBe('2026-09-05T12:00:00.000Z');
  });
});
