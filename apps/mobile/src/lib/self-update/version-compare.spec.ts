import { compareVersionCode, isNewerVersion, parseInstalledVersionCode } from './version-compare';

describe('compareVersionCode', () => {
  it('равные версии — 0', () => {
    expect(compareVersionCode(1030, 1030)).toBe(0);
  });

  it('a новее b — 1', () => {
    expect(compareVersionCode(1031, 1030)).toBe(1);
  });

  it('a старее b — -1', () => {
    expect(compareVersionCode(1030, 1031)).toBe(-1);
  });
});

describe('isNewerVersion', () => {
  it('remote новее local — true', () => {
    expect(isNewerVersion(1031, 1030)).toBe(true);
  });

  it('remote равен local — false', () => {
    expect(isNewerVersion(1030, 1030)).toBe(false);
  });

  it('remote старее local — false', () => {
    expect(isNewerVersion(1029, 1030)).toBe(false);
  });

  it('remote равен нулю — false (испорченный манифест)', () => {
    expect(isNewerVersion(0, 1030)).toBe(false);
  });

  it('remote отрицательный — false', () => {
    expect(isNewerVersion(-5, 1030)).toBe(false);
  });

  it('remote дробный — false', () => {
    expect(isNewerVersion(1030.5, 1030)).toBe(false);
  });

  it('local испорчен (ноль/отрицательный) — false, даже если remote выглядит валидным', () => {
    expect(isNewerVersion(1031, 0)).toBe(false);
    expect(isNewerVersion(1031, -1)).toBe(false);
  });
});

describe('parseInstalledVersionCode', () => {
  it('целое положительное значение возвращается как есть', () => {
    expect(parseInstalledVersionCode(1041)).toBe(1041);
    expect(parseInstalledVersionCode(1)).toBe(1);
  });

  it('нет значения или оно испорчено — null, а не «версия 1»', () => {
    expect(parseInstalledVersionCode(undefined)).toBeNull();
    expect(parseInstalledVersionCode(null)).toBeNull();
    expect(parseInstalledVersionCode(0)).toBeNull();
    expect(parseInstalledVersionCode(-5)).toBeNull();
    expect(parseInstalledVersionCode(10.5)).toBeNull();
    expect(parseInstalledVersionCode(Number.NaN)).toBeNull();
    expect(parseInstalledVersionCode('1041')).toBeNull();
  });
});
