import { buildLoginUrl, parseAuthRedirect } from './login-flow';

describe('buildLoginUrl', () => {
  it('ведёт на провайдера нужного контура с параметрами приложения', () => {
    const url = new URL(buildLoginUrl('https://api.vedamatch.com/', 'yandex', 'CHALLENGE'));
    expect(url.origin + url.pathname).toBe('https://api.vedamatch.com/auth/yandex');
    expect(url.searchParams.get('app_redirect')).toBe('vedamatch://auth');
    expect(url.searchParams.get('app_challenge')).toBe('CHALLENGE');
  });
});

describe('parseAuthRedirect', () => {
  it('достаёт код', () => {
    expect(parseAuthRedirect('vedamatch://auth?code=abc_123')).toEqual({ kind: 'code', code: 'abc_123' });
  });

  it('принимает адрес с косой после хоста, как его отдаёт сервер', () => {
    expect(parseAuthRedirect('vedamatch://auth/?code=abc')).toEqual({ kind: 'code', code: 'abc' });
  });

  it('достаёт текст отказа', () => {
    expect(parseAuthRedirect('vedamatch://auth?error=%D0%A0%D0%B5%D0%B3%D0%B8%D1%81%D1%82%D1%80%D0%B0%D1%86%D0%B8%D1%8F%20%D0%B7%D0%B0%D0%BA%D1%80%D1%8B%D1%82%D0%B0')).toEqual({
      kind: 'error',
      message: 'Регистрация закрыта',
    });
  });

  it('не принимает чужой адрес, пустой возврат и мусор', () => {
    for (const raw of ['vedamatch://other?code=x', 'https://evil.example/auth?code=x', 'vedamatch://auth', 'not a url', `vedamatch://auth?code=${'x'.repeat(129)}`]) {
      expect(parseAuthRedirect(raw)).toEqual({ kind: 'invalid' });
    }
  });
});
