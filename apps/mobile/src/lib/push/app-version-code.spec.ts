import { installedVersionCode } from './app-version-code';

describe('installedVersionCode', () => {
  it('номер сборки из конфига уходит как есть', () => {
    expect(installedVersionCode(1031)).toBe(1031);
  });

  it.each([undefined, null, 0, -1, 1.5, '1031', Number.NaN])(
    '%p — версия неизвестна, поле не отправляем',
    (raw) => {
      expect(installedVersionCode(raw)).toBeUndefined();
    },
  );
});
