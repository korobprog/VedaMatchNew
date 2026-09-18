import { formatApkSizeMb, formatBuildDate, percentOf } from './format';

describe('formatApkSizeMb', () => {
  it('переводит байты в МБ с русской запятой и одним знаком после неё', () => {
    expect(formatApkSizeMb(45_600_000)).toBe('43,5 МБ');
  });

  it('округляет до одного знака', () => {
    expect(formatApkSizeMb(1024 * 1024)).toBe('1,0 МБ');
  });
});

describe('formatBuildDate', () => {
  it('форматирует ISO-дату по-русски, без времени', () => {
    expect(formatBuildDate('2026-09-18T10:00:00Z')).toBe('18 сентября 2026 г.');
  });
});

describe('percentOf', () => {
  it('целый процент, округлённый вниз: 100 % только когда всё действительно готово', () => {
    expect(percentOf(0, 200)).toBe(0);
    expect(percentOf(50, 200)).toBe(25);
    expect(percentOf(199, 200)).toBe(99);
    expect(percentOf(200, 200)).toBe(100);
  });

  it('неизвестный или нулевой объём — 0, а не NaN/Infinity', () => {
    expect(percentOf(10, 0)).toBe(0);
    expect(percentOf(10, -1)).toBe(0);
    expect(percentOf(Number.NaN, 100)).toBe(0);
    expect(percentOf(10, Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('перебор сверх заявленного объёма обрезается до 100', () => {
    expect(percentOf(250, 200)).toBe(100);
  });
});
