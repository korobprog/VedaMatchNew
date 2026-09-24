import { BadRequestException } from '@nestjs/common';
import {
  canManageWorkFinance,
  parseWorkCommercialSettings,
  parseWorkLineItem,
  parseWorkOvertimeRequest,
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

describe('запрос сверх нормы (VED-459)', () => {
  const today = '2026-09-24';

  it('период, минуты в день и причина', () => {
    expect(
      parseWorkOvertimeRequest(
        {
          fromDay: '2026-09-24',
          toDay: '2026-09-26',
          minutesPerDay: 120,
          reason: ' срочный запуск ',
        },
        today,
      ),
    ).toEqual({
      fromDay: '2026-09-24',
      toDay: '2026-09-26',
      minutesPerDay: 120,
      reason: 'срочный запуск',
    });
  });

  it('вчерашний вечер задним числом — можно', () => {
    expect(
      parseWorkOvertimeRequest(
        { fromDay: '2026-09-23', toDay: '2026-09-23', minutesPerDay: 60 },
        today,
      ).fromDay,
    ).toBe('2026-09-23');
  });

  it.each([
    [{ fromDay: '2026-09-26', toDay: '2026-09-24', minutesPerDay: 60 }],
    [{ fromDay: '2026-02-30', toDay: '2026-03-01', minutesPerDay: 60 }],
    [{ fromDay: '24.09.2026', toDay: '2026-09-24', minutesPerDay: 60 }],
    [{ fromDay: '2026-09-01', toDay: '2026-10-15', minutesPerDay: 60 }],
    [{ fromDay: '2026-07-01', toDay: '2026-07-02', minutesPerDay: 60 }],
    [{ fromDay: '2026-09-24', toDay: '2026-09-24', minutesPerDay: 5 }],
    [{ fromDay: '2026-09-24', toDay: '2026-09-24', minutesPerDay: 13 * 60 }],
    [{ fromDay: '2026-09-24', toDay: '2026-09-24', minutesPerDay: 90.5 }],
  ])('мусор — отказ: %j', (input) => {
    expect(() => parseWorkOvertimeRequest(input, today)).toThrow(
      BadRequestException,
    );
  });
});
