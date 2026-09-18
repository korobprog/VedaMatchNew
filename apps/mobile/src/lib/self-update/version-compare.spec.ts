import { compareVersionCode, isNewerVersion } from './version-compare';

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
