import { BadRequestException } from '@nestjs/common';
import {
  canManageWorkFinance,
  parseWorkCommercialSettings,
  parseWorkLineItem,
  parseWorkTimeEntry,
} from './work-finance-settings';

describe('настройки оплаты доски', () => {
  it('без настроек — пустая правка', () => {
    expect(parseWorkCommercialSettings(undefined)).toEqual({});
    expect(parseWorkCommercialSettings(null)).toEqual({});
  });

  it('берёт только переданные поля', () => {
    expect(
      parseWorkCommercialSettings({
        clientName: '  Храм  ',
        rateMinor: 150_000,
        dailyNormMinutes: 180,
        overtimeMode: 'auto',
        timezone: 'Asia/Kolkata',
      }),
    ).toEqual({
      clientName: 'Храм',
      rateMinor: 150_000,
      dailyNormMinutes: 180,
      overtimeMode: 'auto',
      timezone: 'Asia/Kolkata',
    });
  });

  it.each([
    [{ rateMinor: -1 }],
    [{ rateMinor: 10.5 }],
    [{ rateMinor: '1500' as unknown as number }],
    [{ dailyNormMinutes: 24 * 60 + 1 }],
    [{ currency: 'BTC' as never }],
    [{ pricingModel: 'monthly' as never }],
    [{ timezone: 'Mars/Olympus' }],
  ])('мусор — отказ, а не ноль: %j', (input) => {
    expect(() => parseWorkCommercialSettings(input)).toThrow(
      BadRequestException,
    );
  });
});

describe('кто видит деньги доски', () => {
  it('ведущий и администрация — да, участник — нет', () => {
    expect(canManageWorkFinance('member', true)).toBe(true);
    expect(canManageWorkFinance('admin', false)).toBe(true);
    expect(canManageWorkFinance('owner', false)).toBe(true);
    expect(canManageWorkFinance('member', false)).toBe(false);
    expect(canManageWorkFinance('viewer', false)).toBe(false);
  });

  it('не участник среды не видит ничего, даже если числится ведущим', () => {
    expect(canManageWorkFinance(null, true)).toBe(false);
  });
});

describe('время задним числом', () => {
  const now = new Date('2026-09-24T12:00:00Z');

  it('конец — начало плюс длительность', () => {
    const entry = parseWorkTimeEntry('2026-09-24T08:00:00Z', 90, now);
    expect(entry.endedAt.toISOString()).toBe('2026-09-24T09:30:00.000Z');
  });

  it('будущее, ноль и больше суток — отказ', () => {
    expect(() => parseWorkTimeEntry('2026-09-24T11:30:00Z', 60, now)).toThrow(
      BadRequestException,
    );
    expect(() => parseWorkTimeEntry('2026-09-24T08:00:00Z', 0, now)).toThrow(
      BadRequestException,
    );
    expect(() =>
      parseWorkTimeEntry('2026-09-20T08:00:00Z', 24 * 60 + 1, now),
    ).toThrow(BadRequestException);
    expect(() => parseWorkTimeEntry('вчера', 30, now)).toThrow(
      BadRequestException,
    );
  });
});

describe('строка сметы', () => {
  it('расход с суммой', () => {
    expect(
      parseWorkLineItem({
        kind: 'expense',
        title: ' Шрифт ',
        amountMinor: 120_000,
      }),
    ).toEqual({ kind: 'expense', title: 'Шрифт', amountMinor: 120_000 });
  });

  it('пустое название и нулевая сумма — отказ', () => {
    expect(() =>
      parseWorkLineItem({ kind: 'expense', title: '', amountMinor: 100 }),
    ).toThrow(BadRequestException);
    expect(() =>
      parseWorkLineItem({ kind: 'discount', title: 'Скидка', amountMinor: 0 }),
    ).toThrow(BadRequestException);
  });
});
