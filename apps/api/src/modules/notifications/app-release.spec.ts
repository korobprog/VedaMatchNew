import {
  appManifestStorageUrl,
  appManifestUrl,
  isManifestAppVariant,
  manifestStorageBase,
  manifestTrack,
  newReleaseStatus,
  parseReleaseManifest,
} from './app-release';

const manifest = {
  versionName: '1.4.0+abc1234',
  versionCode: 1031,
  sizeBytes: 50_000_000,
  sha256: 'a'.repeat(64),
  url: 'https://s3/mobile/android/ru-site/vedamatch-1.4.0-1031.apk',
  commit: 'abc1234',
  builtAt: '2026-09-24T08:00:00.000Z',
  minAndroid: '7.0',
  notes: '  Голосовые сообщения  ',
};

describe('appManifestUrl', () => {
  it('тот же путь, что пишет CI (manifestObjectKey), без двойного слэша', () => {
    expect(appManifestUrl('https://s3.example/bucket/', 'ru-site')).toBe(
      'https://s3.example/bucket/mobile/android/ru-site/latest.json',
    );
  });
});

describe('parseReleaseManifest', () => {
  it('берёт номер, подпись, заметку и дату сборки', () => {
    expect(parseReleaseManifest(manifest)).toEqual({
      versionCode: 1031,
      versionName: '1.4.0+abc1234',
      notes: 'Голосовые сообщения',
      builtAt: new Date('2026-09-24T08:00:00.000Z'),
    });
  });

  it('манифест без заметки (старые выпуски) — заметки нет, это не ошибка', () => {
    const { notes: _notes, ...old } = manifest;
    expect(parseReleaseManifest(old)?.notes).toBeNull();
  });

  it('заметка режется до разумной длины', () => {
    expect(
      parseReleaseManifest({ ...manifest, notes: 'x'.repeat(5000) })?.notes
        ?.length,
    ).toBe(1000);
  });

  it.each([
    ['HTML страницы ошибки', '<html>'],
    ['пусто', null],
    ['номер строкой', { ...manifest, versionCode: '1031' }],
    ['номер дробный', { ...manifest, versionCode: 10.5 }],
    ['номер ноль', { ...manifest, versionCode: 0 }],
    ['номер больше INTEGER', { ...manifest, versionCode: 2_147_483_648 }],
    ['без подписи версии', { ...manifest, versionName: ' ' }],
  ])('сломанный манифест (%s) — не новая версия', (_label, raw) => {
    expect(parseReleaseManifest(raw)).toBeNull();
  });

  it('битая дата сборки не роняет разбор', () => {
    expect(
      parseReleaseManifest({ ...manifest, builtAt: 'вчера' })?.builtAt,
    ).toBeNull();
  });
});

describe('newReleaseStatus', () => {
  it('первое чтение манифеста — исходная версия, не новость', () => {
    expect(newReleaseStatus(null, 1031)).toBe('baseline');
  });

  it('номер больше известного — вышла новая', () => {
    expect(newReleaseStatus(1030, 1031)).toBe('pending');
  });

  it('тот же номер, что известен, — не новость', () => {
    expect(newReleaseStatus(1031, 1031)).toBe('baseline');
  });

  it('откат на прежний APK — не объявляем', () => {
    expect(newReleaseStatus(1031, 1029)).toBe('baseline');
  });
});

describe('манифест через API: какие сборки и какая папка', () => {
  it('отдаёт только сборки с сайта — у витрины самообновления нет', () => {
    expect(isManifestAppVariant('ru-site')).toBe(true);
    expect(isManifestAppVariant('com-site')).toBe(true);
    expect(isManifestAppVariant('ru-store')).toBe(false);
    expect(isManifestAppVariant('../secret')).toBe(false);
  });

  it('тестовая папка — только по явному track=test', () => {
    expect(manifestTrack('test')).toBe('test');
    expect(manifestTrack(undefined)).toBe('release');
    expect(manifestTrack('TEST')).toBe('release');
    expect(manifestTrack(['test'])).toBe('release');
  });

  it('путь в хранилище тот же, что пишет CI, тестовый — под test/', () => {
    expect(
      appManifestStorageUrl('https://firsts3.ru/bucket/', 'ru-site', 'release'),
    ).toBe('https://firsts3.ru/bucket/mobile/android/ru-site/latest.json');
    expect(
      appManifestStorageUrl('https://firsts3.ru/bucket', 'ru-site', 'test'),
    ).toBe('https://firsts3.ru/bucket/test/mobile/android/ru-site/latest.json');
  });
});

describe('manifestStorageBase', () => {
  const prod = {
    s3Endpoint: 'https://firsts3.ru',
    s3PublicUrl: 'https://media.vedamatch.ru/bucket',
  };

  it('прод: прямой адрес хранилища — берём', () => {
    expect(
      manifestStorageBase({
        ...prod,
        appDownloadBaseUrl: 'https://firsts3.ru/bucket/',
      }),
    ).toEqual({ ok: true, baseUrl: 'https://firsts3.ru/bucket' });
  });

  it('публичный прокси вместо хранилища (подстановка compose при пустом APP_DOWNLOAD_BASE_URL) — отказ', () => {
    const base = manifestStorageBase({
      ...prod,
      appDownloadBaseUrl: 'https://media.vedamatch.ru/bucket',
    });
    expect(base.ok).toBe(false);
    expect(!base.ok && base.reason).toMatch(
      /публичный адрес media\.vedamatch\.ru/,
    );
  });

  it('регистр хоста не обходит проверку', () => {
    expect(
      manifestStorageBase({
        ...prod,
        appDownloadBaseUrl: 'https://MEDIA.vedamatch.ru/bucket',
      }).ok,
    ).toBe(false);
  });

  it('публичный адрес и есть хранилище (как до переезда) — можно', () => {
    expect(
      manifestStorageBase({
        appDownloadBaseUrl: 'https://s3.example/bucket',
        s3PublicUrl: 'https://s3.example/bucket',
        s3Endpoint: 'https://s3.example',
      }),
    ).toEqual({ ok: true, baseUrl: 'https://s3.example/bucket' });
  });

  it('без APP_DOWNLOAD_BASE_URL не подставляет S3_PUBLIC_URL сам', () => {
    expect(manifestStorageBase({ ...prod }).ok).toBe(false);
    expect(manifestStorageBase({ ...prod, appDownloadBaseUrl: '  ' }).ok).toBe(
      false,
    );
  });

  it('мусор вместо адреса — отказ, а не падение', () => {
    expect(
      manifestStorageBase({ ...prod, appDownloadBaseUrl: 'firsts3.ru/bucket' })
        .ok,
    ).toBe(false);
  });
});
