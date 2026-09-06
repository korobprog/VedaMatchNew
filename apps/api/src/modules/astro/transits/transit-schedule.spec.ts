import {
  isLocalPushWindow,
  localHour,
  normalizePushHour,
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

  it('час рассылки задаётся человеком, окно считается по кругу через полночь', () => {
    // 04:00 UTC = 07:00 по Москве: выбравшему семь утра — пора, девятичасовому — рано.
    const four = new Date('2026-08-10T04:00:00.000Z');
    expect(isLocalPushWindow(four, null, 7)).toBe(true);
    expect(isLocalPushWindow(four, null)).toBe(false);
    // 23:00 местного с окном два часа захватывает 00:30 следующих суток.
    expect(isLocalPushWindow(new Date('2026-08-10T21:30:00.000Z'), null, 23)).toBe(true);
    expect(isLocalPushWindow(new Date('2026-08-10T19:30:00.000Z'), null, 23)).toBe(false);
  });

  it('нормализует час: странное падает в девять', () => {
    expect(normalizePushHour(7)).toBe(7);
    expect(normalizePushHour(0)).toBe(0);
    expect(normalizePushHour(24)).toBe(9);
    expect(normalizePushHour('x')).toBe(9);
    expect(normalizePushHour(7.5)).toBe(9);
  });
});
