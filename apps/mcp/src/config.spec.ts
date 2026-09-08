import { describe, expect, it } from 'vitest';
import { ConfigError, readConfig, stripTrailingSlash } from './config.js';

describe('readConfig', () => {
  it('берёт ключ и адрес из окружения', () => {
    expect(
      readConfig({
        VEDAMATCH_API_KEY: 'vm_secret',
        VEDAMATCH_API_URL: 'https://vedamatch.ru',
      }),
    ).toEqual({ baseUrl: 'https://vedamatch.ru', apiKey: 'vm_secret' });
  });

  it('без адреса работает с локальным API', () => {
    expect(readConfig({ VEDAMATCH_API_KEY: 'vm_secret' }).baseUrl).toBe(
      'http://localhost:4000',
    );
  });

  it('хвостовой слэш в адресе не превращается в двойной', () => {
    expect(
      readConfig({
        VEDAMATCH_API_KEY: 'vm_secret',
        VEDAMATCH_API_URL: 'https://vedamatch.ru///',
      }).baseUrl,
    ).toBe('https://vedamatch.ru');
  });

  it('без ключа объясняет, где его взять', () => {
    expect(() => readConfig({})).toThrow(ConfigError);
    expect(() => readConfig({})).toThrow(/Настройки → Ключи доступа/);
  });

  it('пробелы вместо ключа — это отсутствие ключа', () => {
    expect(() => readConfig({ VEDAMATCH_API_KEY: '   ' })).toThrow(ConfigError);
  });

  it('вписанный вместо ключа JWT распознаётся и объясняется', () => {
    expect(() =>
      readConfig({ VEDAMATCH_API_KEY: 'eyJhbGciOiJSUzI1NiJ9.e30.sig' }),
    ).toThrow(/начинается с «vm_»/);
  });
});

describe('stripTrailingSlash', () => {
  it('не трогает адрес без слэша', () => {
    expect(stripTrailingSlash('https://vedamatch.ru')).toBe(
      'https://vedamatch.ru',
    );
  });
});
