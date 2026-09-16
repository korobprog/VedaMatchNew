import { resolveVersionCode, resolveVersionName } from './app-version';

describe('resolveVersionCode', () => {
  it('без переменной — 1 (локальная сборка)', () => {
    expect(resolveVersionCode({})).toBe(1);
  });

  it('берёт целое число из APP_VERSION_CODE', () => {
    expect(resolveVersionCode({ APP_VERSION_CODE: '21042' })).toBe(21042);
  });

  it('отказывает на нецелом значении', () => {
    expect(() => resolveVersionCode({ APP_VERSION_CODE: '1.5' })).toThrow();
  });

  it('отказывает на нуле и отрицательных', () => {
    expect(() => resolveVersionCode({ APP_VERSION_CODE: '0' })).toThrow();
    expect(() => resolveVersionCode({ APP_VERSION_CODE: '-3' })).toThrow();
  });

  it('отказывает на мусоре', () => {
    expect(() => resolveVersionCode({ APP_VERSION_CODE: 'abc' })).toThrow();
  });
});

describe('resolveVersionName', () => {
  it('без sha — голый номер пакета', () => {
    expect(resolveVersionName('0.1.0', {})).toBe('0.1.0');
  });

  it('с sha — номер пакета плюс первые семь символов', () => {
    expect(
      resolveVersionName('0.1.0', { APP_VERSION_SHA: 'abcdef1234567890' }),
    ).toBe('0.1.0+abcdef1');
  });
});
