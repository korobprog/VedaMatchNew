import { formatApkSizeMb, formatBuildDate } from './format';

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
