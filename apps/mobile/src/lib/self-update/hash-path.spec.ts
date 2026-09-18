import { chooseHashPath, nativeHashFailureAction, NATIVE_HASH_CANCELLED_CODE } from './hash-path';

describe('chooseHashPath', () => {
  it('Android с нативным модулем — native', () => {
    expect(chooseHashPath({ platformOS: 'android', nativeModuleAvailable: true })).toBe('native');
  });

  it('Android без модуля (сборка без него) — js', () => {
    expect(chooseHashPath({ platformOS: 'android', nativeModuleAvailable: false })).toBe('js');
  });

  it('iOS и веб — всегда js, даже если что-то назвалось модулем', () => {
    expect(chooseHashPath({ platformOS: 'ios', nativeModuleAvailable: true })).toBe('js');
    expect(chooseHashPath({ platformOS: 'web', nativeModuleAvailable: true })).toBe('js');
    expect(chooseHashPath({ platformOS: 'ios', nativeModuleAvailable: false })).toBe('js');
  });
});

describe('nativeHashFailureAction', () => {
  it('отмена нативной проверки остаётся отменой', () => {
    expect(nativeHashFailureAction({ code: NATIVE_HASH_CANCELLED_CODE, message: 'x' })).toBe('cancelled');
    expect(NATIVE_HASH_CANCELLED_CODE).toBe('ERR_HASH_CANCELLED');
  });

  it('прочие ошибки (файл не найден, неизвестная схема, не объект) — запасной JS-путь', () => {
    expect(nativeHashFailureAction({ code: 'ERR_FILE_NOT_FOUND' })).toBe('fallback-to-js');
    expect(nativeHashFailureAction(new Error('boom'))).toBe('fallback-to-js');
    expect(nativeHashFailureAction('строка')).toBe('fallback-to-js');
    expect(nativeHashFailureAction(null)).toBe('fallback-to-js');
    expect(nativeHashFailureAction(undefined)).toBe('fallback-to-js');
  });
});
