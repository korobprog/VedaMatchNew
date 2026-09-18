import { resolveVariant } from './variant';

describe('resolveVariant', () => {
  it('по умолчанию собирает российский контур для сайта', () => {
    expect(resolveVariant({})).toEqual({
      contour: 'ru',
      channel: 'site',
      apiOrigin: 'https://api.vedamatch.ru',
      webOrigin: 'https://vedamatch.ru',
      downloadBaseUrl: null,
      selfUpdate: true,
      pushProviders: ['rustore', 'fcm'],
    });
  });

  it('без APP_DOWNLOAD_BASE_URL адреса раздачи нет — сайт не подставляется молча (он отвечает 307 на лендинг)', () => {
    expect(resolveVariant({ APP_CONTOUR: 'com' }).downloadBaseUrl).toBeNull();
    expect(resolveVariant({ APP_DOWNLOAD_BASE_URL: '   ' }).downloadBaseUrl).toBeNull();
  });

  it('APP_DOWNLOAD_BASE_URL переопределяет адрес раздачи манифеста отдельно от сайта', () => {
    const variant = resolveVariant({ APP_DOWNLOAD_BASE_URL: 'https://s3.example.com/vedamatch-bucket/' });
    expect(variant.downloadBaseUrl).toBe('https://s3.example.com/vedamatch-bucket');
    // Путь у этого адреса разрешён (в отличие от APP_API_ORIGIN/APP_WEB_ORIGIN) —
    // публичный адрес S3-хранилища обычно устроен как host/bucket-name.
    expect(variant.webOrigin).toBe('https://vedamatch.ru');
  });

  it('падает на APP_DOWNLOAD_BASE_URL без http/https', () => {
    expect(() => resolveVariant({ APP_DOWNLOAD_BASE_URL: 'ftp://s3.example.com' })).toThrow('нужен http или https');
    expect(() => resolveVariant({ APP_DOWNLOAD_BASE_URL: 'не-адрес' })).toThrow('не является адресом');
  });

  it('глобальная сборка для магазина не обновляет себя и шлёт пуши через FCM', () => {
    const variant = resolveVariant({ APP_CONTOUR: 'com', APP_CHANNEL: 'store' });
    expect(variant.apiOrigin).toBe('https://api.vedamatch.com');
    expect(variant.webOrigin).toBe('https://vedamatch.com');
    expect(variant.selfUpdate).toBe(false);
    expect(variant.pushProviders).toEqual(['fcm']);
  });

  it('российская сборка для RuStore тоже без самообновления', () => {
    expect(resolveVariant({ APP_CONTOUR: 'ru', APP_CHANNEL: 'store' }).selfUpdate).toBe(false);
  });

  it('пустые и пробельные значения считаются неуказанными', () => {
    expect(resolveVariant({ APP_CONTOUR: '  ', APP_CHANNEL: '' }).contour).toBe('ru');
  });

  it('падает на неизвестном контуре, а не собирает не тот', () => {
    expect(() => resolveVariant({ APP_CONTOUR: 'eu' })).toThrow('APP_CONTOUR="eu"');
    expect(() => resolveVariant({ APP_CHANNEL: 'play' })).toThrow('APP_CHANNEL="play"');
  });

  it('берёт адрес API для разработки и отрезает завершающий слэш', () => {
    const variant = resolveVariant({ APP_API_ORIGIN: 'http://10.0.2.2:4000/' });
    expect(variant.apiOrigin).toBe('http://10.0.2.2:4000');
    expect(variant.webOrigin).toBe('https://vedamatch.ru');
  });

  it('не принимает адрес с путём или чужой схемой', () => {
    expect(() => resolveVariant({ APP_API_ORIGIN: 'https://api.vedamatch.ru/v1' })).toThrow('без пути');
    expect(() => resolveVariant({ APP_WEB_ORIGIN: 'ftp://vedamatch.ru' })).toThrow('http или https');
    expect(() => resolveVariant({ APP_API_ORIGIN: 'vedamatch' })).toThrow('не является адресом');
  });

  it('не отдаёт наружу общий массив провайдеров', () => {
    const first = resolveVariant({});
    first.pushProviders.push('fcm');
    expect(resolveVariant({}).pushProviders).toEqual(['rustore', 'fcm']);
  });
});
