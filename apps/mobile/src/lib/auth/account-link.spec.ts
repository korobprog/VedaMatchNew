import {
  buildLinkUrl,
  buildProviderRows,
  linkErrorMessage,
  linkSuccessMessage,
  providerLabel,
  readLinkQuery,
} from './account-link';

describe('providerLabel', () => {
  it('переводит известные провайдеры', () => {
    expect(providerLabel('google')).toBe('Google');
    expect(providerLabel('yandex')).toBe('Яндекс');
    expect(providerLabel('telegram')).toBe('Telegram');
  });

  it('незнакомое значение возвращает как есть', () => {
    expect(providerLabel('apple')).toBe('apple');
  });
});

describe('readLinkQuery', () => {
  it('находит успех привязки', () => {
    expect(readLinkQuery('?linked=google')).toEqual({ kind: 'linked', provider: 'google' });
  });

  it('находит отказ привязки', () => {
    expect(readLinkQuery('?linkError=conflict')).toEqual({ kind: 'error', code: 'conflict' });
  });

  it('пусто — ни того, ни другого', () => {
    expect(readLinkQuery('')).toEqual({ kind: 'none' });
    expect(readLinkQuery('?foo=bar')).toEqual({ kind: 'none' });
  });

  it('успех побеждает при обоих параметрах разом', () => {
    expect(readLinkQuery('?linked=google&linkError=session')).toEqual({
      kind: 'linked',
      provider: 'google',
    });
  });
});

describe('linkErrorMessage', () => {
  it('знает про session и conflict', () => {
    expect(linkErrorMessage('session')).toMatch(/сессия/i);
    expect(linkErrorMessage('conflict')).toMatch(/уже привязан/);
  });

  it('незнакомый код — общий текст', () => {
    expect(linkErrorMessage('что-то-новое')).toBe(
      'Не удалось привязать способ входа. Попробуйте ещё раз.',
    );
  });
});

describe('linkSuccessMessage', () => {
  it('называет провайдера в сообщении', () => {
    expect(linkSuccessMessage('yandex')).toBe('Яндекс привязан к аккаунту.');
  });
});

describe('buildLinkUrl', () => {
  it('собирает адрес с link=1 и путём возврата по умолчанию', () => {
    const url = buildLinkUrl('https://api.vedamatch.com', 'google', 'https://ios.vedamatch.com');
    const parsed = new URL(url);
    expect(parsed.origin).toBe('https://api.vedamatch.com');
    expect(parsed.pathname).toBe('/auth/google');
    expect(parsed.searchParams.get('link')).toBe('1');
    expect(parsed.searchParams.get('returnOrigin')).toBe('https://ios.vedamatch.com');
    expect(parsed.searchParams.get('returnTo')).toBe('/account');
  });

  it('лишний слэш на конце адреса API не портит путь', () => {
    const url = buildLinkUrl('https://api.vedamatch.com/', 'yandex', 'https://ios.vedamatch.com');
    expect(new URL(url).pathname).toBe('/auth/yandex');
  });
});

describe('buildProviderRows', () => {
  it('три строки в фиксированном порядке, даже когда с сервера пусто', () => {
    expect(buildProviderRows([])).toEqual([
      { provider: 'google', linked: false, canUnlink: false },
      { provider: 'yandex', linked: false, canUnlink: false },
      { provider: 'telegram', linked: false, canUnlink: false },
    ]);
  });

  it('найденный способ помечается привязанным с его canUnlink', () => {
    const rows = buildProviderRows([
      { provider: 'google', canUnlink: false },
      { provider: 'telegram', canUnlink: true },
    ]);
    expect(rows).toEqual([
      { provider: 'google', linked: true, canUnlink: false },
      { provider: 'yandex', linked: false, canUnlink: false },
      { provider: 'telegram', linked: true, canUnlink: true },
    ]);
  });

  it('провайдеры вне тройки (vk, email) не всплывают строкой', () => {
    const rows = buildProviderRows([{ provider: 'email', canUnlink: true }]);
    expect(rows.every((row) => row.provider !== ('email' as never))).toBe(true);
    expect(rows.every((row) => !row.linked)).toBe(true);
  });
});
