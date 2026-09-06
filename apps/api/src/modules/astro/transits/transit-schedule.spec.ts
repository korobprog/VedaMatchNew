import {
  isLocalPushWindow,
  localHour,
  scanKey,
} from './transit-schedule';

describe('transit-schedule', () => {
  // 06:00 UTC — это 09:00 по Москве.
  const six = new Date('2026-08-10T06:00:00.000Z');

  it('без зоны считает по Москве', () => {
    expect(localHour(six, null)).toBe(9);
    expect(isLocalPushWindow(six, null)).toBe(true);
    expect(isLocalPushWindow(new Date('2026-08-10T02:59:00.000Z'), null)).toBe(false);
    expect(isLocalPushWindow(new Date('2026-08-10T08:00:00.000Z'), null)).toBe(false);
  });

  it('во Владивостоке утро наступает на семь часов раньше по UTC', () => {
    // 23:00 UTC накануне — это 09:00 во Владивостоке (UTC+10).
    expect(localHour(new Date('2026-08-09T23:00:00.000Z'), 'Asia/Vladivostok')).toBe(9);
    expect(isLocalPushWindow(new Date('2026-08-09T23:00:00.000Z'), 'Asia/Vladivostok')).toBe(true);
    // А в 06:00 UTC там уже 16:00 — вечер, слать поздно.
    expect(isLocalPushWindow(six, 'Asia/Vladivostok')).toBe(false);
  });

  it('учитывает летнее время зоны, а не фиксированный сдвиг', () => {
    // Лондон в августе — UTC+1: 08:00 UTC = 09:00 местного.
    expect(localHour(new Date('2026-08-10T08:00:00.000Z'), 'Europe/London')).toBe(9);
    // В январе — UTC+0.
    expect(localHour(new Date('2026-01-10T08:00:00.000Z'), 'Europe/London')).toBe(8);
  });

  it('незнакомая зона не роняет расчёт, а падает в Москву', () => {
    expect(localHour(six, 'Mars/Olympus')).toBe(9);
  });

  it('ключ обхода — час по UTC', () => {
    expect(scanKey(six)).toBe('2026-08-10T06');
    expect(scanKey(new Date('2026-08-10T06:59:59.000Z'))).toBe('2026-08-10T06');
    expect(scanKey(new Date('2026-08-10T07:00:00.000Z'))).toBe('2026-08-10T07');
  });
});
