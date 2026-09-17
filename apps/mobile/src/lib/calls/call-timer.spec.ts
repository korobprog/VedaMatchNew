import { elapsedSeconds, formatElapsed } from './call-timer';

describe('formatElapsed', () => {
  it('меньше минуты — 0:сс', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(7)).toBe('0:07');
    expect(formatElapsed(59)).toBe('0:59');
  });

  it('минуты без часов — м:сс, минуты не дополняются нулём', () => {
    expect(formatElapsed(60)).toBe('1:00');
    expect(formatElapsed(125)).toBe('2:05');
  });

  it('час и больше — ч:мм:сс, минуты дополняются нулём', () => {
    expect(formatElapsed(3600)).toBe('1:00:00');
    expect(formatElapsed(3661)).toBe('1:01:01');
    expect(formatElapsed(3600 * 2 + 65)).toBe('2:01:05');
  });

  it('отрицательные и дробные секунды не ломают формат', () => {
    expect(formatElapsed(-5)).toBe('0:00');
    expect(formatElapsed(7.9)).toBe('0:07');
  });
});

describe('elapsedSeconds', () => {
  it('since = null — 0', () => {
    expect(elapsedSeconds(null, 100_000)).toBe(0);
  });

  it('разница в мс округляется вниз до секунд', () => {
    expect(elapsedSeconds(1_000, 1_000 + 72_400)).toBe(72);
  });

  it('now раньше since (рассинхрон часов) — не уходит в минус', () => {
    expect(elapsedSeconds(10_000, 9_000)).toBe(0);
  });
});
