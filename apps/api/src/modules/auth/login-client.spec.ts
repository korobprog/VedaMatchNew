import { resolveLoginClient } from './login-client';

describe('resolveLoginClient', () => {
  it('маркирует вход из мини-приложения Telegram', () => {
    expect(resolveLoginClient({ kind: 'telegram' })).toBe('telegram');
  });

  it('маркирует PKCE-вход, который завершает приложение', () => {
    expect(resolveLoginClient({ kind: 'app' })).toBe('android');
  });

  it('маркирует OAuth-возврат на основной портал контура как сайт', () => {
    expect(
      resolveLoginClient({
        kind: 'oauth',
        resolvedOrigin: 'https://vedamatch.com',
        contourWebOrigin: 'https://vedamatch.com',
      }),
    ).toBe('site');
  });

  it('маркирует OAuth-возврат на поддомен приложения как веб-версию', () => {
    expect(
      resolveLoginClient({
        kind: 'oauth',
        resolvedOrigin: 'https://ios.vedamatch.com',
        contourWebOrigin: 'https://vedamatch.com',
      }),
    ).toBe('web-app');
  });

  it('различает контуры .ru и .com при сравнении origin', () => {
    expect(
      resolveLoginClient({
        kind: 'oauth',
        resolvedOrigin: 'https://vedamatch.ru',
        contourWebOrigin: 'https://vedamatch.com',
      }),
    ).toBe('web-app');
  });
});
