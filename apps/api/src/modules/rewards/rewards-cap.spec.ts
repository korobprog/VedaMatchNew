import { applyMonthlyCap, earnedInWindow, monthWindow } from './rewards-cap';

describe('applyMonthlyCap', () => {
  it('пропускает начисление целиком, пока есть запас', () => {
    expect(applyMonthlyCap(30, 100, 300)).toEqual({
      granted: 30,
      withheld: 0,
      capped: false,
    });
  });

  // Потолок режет, а не отменяет: половина лучше нуля, и остаток никуда не
  // переносится — иначе потолок перестаёт быть потолком.
  it('срезает до остатка, а не отбрасывает начисление', () => {
    expect(applyMonthlyCap(30, 290, 300)).toEqual({
      granted: 10,
      withheld: 20,
      capped: true,
    });
  });

  it('отдаёт ноль, когда потолок уже выбран', () => {
    expect(applyMonthlyCap(30, 300, 300)).toEqual({
      granted: 0,
      withheld: 30,
      capped: true,
    });
    expect(applyMonthlyCap(30, 999, 300).granted).toBe(0);
  });

  it('нулевой и отрицательный потолок означают «без ограничения»', () => {
    expect(applyMonthlyCap(30, 10_000, 0).granted).toBe(30);
    expect(applyMonthlyCap(30, 10_000, -1).granted).toBe(30);
  });

  it('не начисляет отрицательное и не считает дроби', () => {
    expect(applyMonthlyCap(-30, 0, 300).granted).toBe(0);
    expect(applyMonthlyCap(30.9, 0, 300).granted).toBe(30);
  });
});

describe('monthWindow', () => {
  it('берёт календарный месяц в UTC', () => {
    const { from, to } = monthWindow(new Date('2026-08-23T18:00:00.000Z'));
    expect(from.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(to.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('перешагивает через год', () => {
    const { to } = monthWindow(new Date('2026-12-31T23:59:59.000Z'));
    expect(to.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('earnedInWindow', () => {
  const window = monthWindow(new Date('2026-08-15T00:00:00.000Z'));

  it('складывает только начисления внутри окна', () => {
    const earned = earnedInWindow(
      [
        { amount: 30, createdAt: new Date('2026-08-01T00:00:00.000Z') },
        { amount: 10, createdAt: new Date('2026-08-31T23:59:00.000Z') },
        { amount: 100, createdAt: new Date('2026-07-31T23:59:00.000Z') },
        { amount: 100, createdAt: new Date('2026-09-01T00:00:00.000Z') },
      ],
      window,
    );
    expect(earned).toBe(40);
  });

  // Отмена не возвращает право заработать столько же снова: иначе админ,
  // сняв накрутку, тем же действием выдавал бы новый лимит.
  it('не вычитает отмену из счётчика месяца', () => {
    const earned = earnedInWindow(
      [
        { amount: 30, createdAt: new Date('2026-08-05T00:00:00.000Z') },
        { amount: -30, createdAt: new Date('2026-08-06T00:00:00.000Z') },
      ],
      window,
    );
    expect(earned).toBe(30);
  });
});
