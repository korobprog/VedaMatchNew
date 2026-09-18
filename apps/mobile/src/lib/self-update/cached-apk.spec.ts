import { cachedApkFileName, isOwnCachedApk, parseCachedApkVersion, shouldDeleteCachedApk } from './cached-apk';

describe('cachedApkFileName / parseCachedApkVersion', () => {
  it('имя несёт versionCode и читается обратно', () => {
    expect(cachedApkFileName(2013)).toBe('vedamatch-update-2013.apk');
    expect(parseCachedApkVersion(cachedApkFileName(2013))).toBe(2013);
  });

  it('старое имя итераций 1–2 и испорченная версия — наш файл без версии (null)', () => {
    expect(parseCachedApkVersion('vedamatch-update.apk')).toBeNull();
    expect(parseCachedApkVersion('vedamatch-update-0.apk')).toBeNull();
    expect(parseCachedApkVersion('vedamatch-update-abc.apk')).toBeNull();
  });

  it('чужие файлы кэша — undefined', () => {
    expect(parseCachedApkVersion('ImagePicker-123.jpg')).toBeUndefined();
    expect(parseCachedApkVersion('other-2013.apk')).toBeUndefined();
    expect(parseCachedApkVersion('vedamatch-update-2013.apk.tmp')).toBeUndefined();
  });
});

describe('shouldDeleteCachedApk', () => {
  it('файл той же версии, что установлена, — удалить (обновление уже поставлено)', () => {
    expect(shouldDeleteCachedApk({ fileName: 'vedamatch-update-2013.apk', installedVersionCode: 2013 })).toBe(true);
  });

  it('файл старее установленной — удалить', () => {
    expect(shouldDeleteCachedApk({ fileName: 'vedamatch-update-2012.apk', installedVersionCode: 2013 })).toBe(true);
  });

  it('файл новее установленной — оставить (человек мог отказаться в установщике)', () => {
    expect(shouldDeleteCachedApk({ fileName: 'vedamatch-update-2014.apk', installedVersionCode: 2013 })).toBe(false);
  });

  it('старое имя без версии — удалить (раунд 002: 228 МБ после установки)', () => {
    expect(shouldDeleteCachedApk({ fileName: 'vedamatch-update.apk', installedVersionCode: 2012 })).toBe(true);
  });

  it('установленная версия неизвестна — наш файл удаляется, сравнивать не с чем', () => {
    expect(shouldDeleteCachedApk({ fileName: 'vedamatch-update-2014.apk', installedVersionCode: null })).toBe(true);
  });

  it('чужой файл кэша не трогаем никогда', () => {
    expect(shouldDeleteCachedApk({ fileName: 'ImagePicker-1.jpg', installedVersionCode: 2013 })).toBe(false);
    expect(shouldDeleteCachedApk({ fileName: 'ImagePicker-1.jpg', installedVersionCode: null })).toBe(false);
  });
});

describe('isOwnCachedApk', () => {
  it('перед новой закачкой — все наши APK любой версии, и только они', () => {
    expect(isOwnCachedApk('vedamatch-update.apk')).toBe(true);
    expect(isOwnCachedApk('vedamatch-update-2014.apk')).toBe(true);
    expect(isOwnCachedApk('ImagePicker-1.jpg')).toBe(false);
  });
});
