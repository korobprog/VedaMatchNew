import { parseAppManifest } from './manifest-validation';

const validRaw = {
  versionName: '0.1.0+a1b2c3d',
  versionCode: 1031,
  sizeBytes: 45_600_000,
  sha256: 'a'.repeat(64),
  url: 'https://storage.example.com/mobile/android/ru-site/vedamatch-0.1.0-1031.apk',
  commit: 'a1b2c3d',
  builtAt: '2026-09-18T10:00:00Z',
  minAndroid: '7.0',
};

describe('parseAppManifest', () => {
  it('валидный манифест разбирается целиком, sha256 приводится к нижнему регистру', () => {
    const manifest = parseAppManifest({ ...validRaw, sha256: 'A'.repeat(64) });
    expect(manifest).toEqual({ ...validRaw, sha256: 'a'.repeat(64) });
  });

  it('не объект (HTML страница ошибки хранилища, строка, число) — null', () => {
    expect(parseAppManifest('<html>404</html>')).toBeNull();
    expect(parseAppManifest(42)).toBeNull();
    expect(parseAppManifest(null)).toBeNull();
    expect(parseAppManifest(undefined)).toBeNull();
    expect(parseAppManifest([])).toBeNull();
  });

  const cases: [string, unknown][] = [
    ['versionName отсутствует', { ...validRaw, versionName: undefined }],
    ['versionName пустая строка', { ...validRaw, versionName: '' }],
    ['versionName не строка', { ...validRaw, versionName: 123 }],
    ['versionCode отсутствует', { ...validRaw, versionCode: undefined }],
    ['versionCode дробный', { ...validRaw, versionCode: 1031.5 }],
    ['versionCode нулевой', { ...validRaw, versionCode: 0 }],
    ['versionCode отрицательный', { ...validRaw, versionCode: -1 }],
    ['versionCode строкой', { ...validRaw, versionCode: '1031' }],
    ['sizeBytes отсутствует', { ...validRaw, sizeBytes: undefined }],
    ['sizeBytes нулевой', { ...validRaw, sizeBytes: 0 }],
    ['sizeBytes отрицательный', { ...validRaw, sizeBytes: -10 }],
    ['sha256 отсутствует', { ...validRaw, sha256: undefined }],
    ['sha256 неверной длины', { ...validRaw, sha256: 'abc123' }],
    ['sha256 не hex', { ...validRaw, sha256: 'z'.repeat(64) }],
    ['url отсутствует', { ...validRaw, url: undefined }],
    ['url не http(s)', { ...validRaw, url: 'ftp://storage.example.com/apk' }],
    ['commit отсутствует', { ...validRaw, commit: undefined }],
    ['commit пустая строка', { ...validRaw, commit: '' }],
    ['builtAt отсутствует', { ...validRaw, builtAt: undefined }],
    ['builtAt не дата', { ...validRaw, builtAt: 'вчера' }],
    ['minAndroid отсутствует', { ...validRaw, minAndroid: undefined }],
    ['minAndroid пустая строка', { ...validRaw, minAndroid: '' }],
  ];

  it.each(cases)('%s — null, а не исключение', (_label, raw) => {
    expect(parseAppManifest(raw)).toBeNull();
  });
});
