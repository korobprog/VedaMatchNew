import { nullableString, variantFromExtra } from './variant-from-extra';
import type { AppVariant } from './variant';

const base = {
  contour: 'ru',
  channel: 'site',
  apiOrigin: 'https://api.vedamatch.ru',
  webOrigin: 'https://vedamatch.ru',
  pushProviders: ['rustore', 'fcm'],
  selfUpdate: true,
} as unknown as AppVariant;

describe('nullableString', () => {
  it('пустой объект из сериализации конфига — это «не задано», а не значение', () => {
    // `expo config --json` без APP_DOWNLOAD_BASE_URL кладёт в extra `{}`.
    expect(nullableString({})).toBeNull();
  });

  it('null, undefined, число и массив тоже дают null', () => {
    expect(nullableString(null)).toBeNull();
    expect(nullableString(undefined)).toBeNull();
    expect(nullableString(42)).toBeNull();
    expect(nullableString([])).toBeNull();
  });

  it('пустая строка и пробелы — «не задано»', () => {
    expect(nullableString('')).toBeNull();
    expect(nullableString('   ')).toBeNull();
  });

  it('строку возвращает без крайних пробелов', () => {
    expect(nullableString('  https://s3.example/bucket  ')).toBe('https://s3.example/bucket');
  });
});

describe('variantFromExtra', () => {
  it('адрес раздачи из пустого объекта становится null — экран скажет «не настроен», а не упадёт', () => {
    const variant = variantFromExtra({ ...base, downloadBaseUrl: {} });
    expect(variant.downloadBaseUrl).toBeNull();
  });

  it('заданный адрес доезжает как есть', () => {
    const variant = variantFromExtra({
      ...base,
      downloadBaseUrl: 'https://s3.example/bucket',
    });
    expect(variant.downloadBaseUrl).toBe('https://s3.example/bucket');
  });

  it('остальные поля не меняются', () => {
    const variant = variantFromExtra({ ...base, downloadBaseUrl: {} });
    expect(variant.contour).toBe('ru');
    expect(variant.channel).toBe('site');
    expect(variant.apiOrigin).toBe('https://api.vedamatch.ru');
    expect(variant.pushProviders).toEqual(['rustore', 'fcm']);
  });

  it('исходный объект не меняется', () => {
    const raw = { ...base, downloadBaseUrl: {} };
    variantFromExtra(raw);
    expect(raw.downloadBaseUrl).toEqual({});
  });

  it('без варианта — понятная ошибка про сборку без app.config.ts', () => {
    expect(() => variantFromExtra(undefined)).toThrow(/app\.config\.ts/);
    expect(() => variantFromExtra(null)).toThrow(/app\.config\.ts/);
    expect(() => variantFromExtra('site')).toThrow(/app\.config\.ts/);
  });
});
