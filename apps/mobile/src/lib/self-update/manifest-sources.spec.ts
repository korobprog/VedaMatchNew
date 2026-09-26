import { apiManifestUrl, manifestSources, manifestTrack, manifestUrl } from './manifest-sources';

/**
 * Порядок источников манифеста. Главное, ради чего он заведён: адрес API
 * (`apiOrigin`) не меняется, а адрес хранилища 24.09 сменился — и сборки,
 * которые знали только его, остались без обновлений навсегда.
 */

const API = 'https://api.vedamatch.ru';
const S3 = 'https://firsts3.ru/bucket-id';
const variant = { apiOrigin: API, downloadBaseUrl: S3, contour: 'ru' as const, channel: 'site' as const };

describe('manifestSources', () => {
  it('сначала API портала, потом зашитый адрес хранилища', () => {
    expect(manifestSources(variant)).toEqual([
      { kind: 'api', url: `${API}/notifications/app-release/ru-site/latest.json` },
      { kind: 'direct', url: `${S3}/mobile/android/ru-site/latest.json` },
    ]);
  });

  it('без адреса хранилища в сборке — только API', () => {
    expect(manifestSources({ ...variant, downloadBaseUrl: null })).toEqual([
      { kind: 'api', url: `${API}/notifications/app-release/ru-site/latest.json` },
    ]);
  });

  it('без API — только хранилище', () => {
    expect(manifestSources({ ...variant, apiOrigin: null }).map((source) => source.kind)).toEqual(['direct']);
  });

  it('ни того, ни другого — пусто (секция скажет «не настроено»)', () => {
    expect(manifestSources({ ...variant, apiOrigin: null, downloadBaseUrl: null })).toEqual([]);
  });

  it('контур и канал — из варианта, не хардкод ru-site', () => {
    expect(apiManifestUrl({ ...variant, apiOrigin: 'https://api.vedamatch.com', contour: 'com' })).toBe(
      'https://api.vedamatch.com/notifications/app-release/com-site/latest.json',
    );
  });

  it('локальный API разработчика подходит так же', () => {
    expect(apiManifestUrl({ ...variant, apiOrigin: 'http://10.0.2.2:4000/' })).toBe(
      'http://10.0.2.2:4000/notifications/app-release/ru-site/latest.json',
    );
  });
});

describe('тестовая папка (стенд проверки самообновления)', () => {
  it('сборка с APP_DOWNLOAD_BASE_URL=…/test спрашивает у API тестовый манифест', () => {
    const test = { ...variant, downloadBaseUrl: `${S3}/test` };
    expect(manifestTrack(test.downloadBaseUrl)).toBe('test');
    expect(manifestSources(test)).toEqual([
      { kind: 'api', url: `${API}/notifications/app-release/ru-site/latest.json?track=test` },
      { kind: 'direct', url: `${S3}/test/mobile/android/ru-site/latest.json` },
    ]);
  });

  it('хвостовой слэш не мешает узнать тестовую папку', () => {
    expect(manifestTrack(`${S3}/test/`)).toBe('test');
  });

  it('боевой адрес и похожие имена — боевая раздача', () => {
    expect(manifestTrack(S3)).toBe('release');
    expect(manifestTrack('https://firsts3.ru/contest')).toBe('release');
    expect(manifestTrack(null)).toBe('release');
  });
});

describe('manifestUrl', () => {
  it('прямой адрес — тот же путь, что пишет воркфлоу', () => {
    expect(manifestUrl(variant)).toBe(`${S3}/mobile/android/ru-site/latest.json`);
  });
});
