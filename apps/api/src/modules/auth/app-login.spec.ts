import {
  APP_REDIRECT_URIS,
  AppLoginRequestError,
  appRedirectUrl,
  parseAppLoginRequest,
  pkceChallengeS256,
  verifyPkceS256,
} from './app-login';

// Пример из RFC 7636, приложение B.
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('parseAppLoginRequest', () => {
  it('без параметров приложения это вход с сайта', () => {
    expect(parseAppLoginRequest({})).toBeNull();
  });

  it('принимает разрешённый адрес и корректный challenge', () => {
    expect(
      parseAppLoginRequest({
        appRedirect: 'vedamatch://auth',
        appChallenge: RFC_CHALLENGE,
      }),
    ).toEqual({ redirect: 'vedamatch://auth', challenge: RFC_CHALLENGE });
  });

  it('принимает возврат сборки разработчика (com.vedamatch.app.dev)', () => {
    expect(
      parseAppLoginRequest({
        appRedirect: 'vedamatch-dev://auth',
        appChallenge: RFC_CHALLENGE,
      }),
    ).toEqual({ redirect: 'vedamatch-dev://auth', challenge: RFC_CHALLENGE });
  });

  it('не отдаёт код на чужой адрес', () => {
    for (const appRedirect of [
      'vedamatch://evil',
      'https://evil.example/auth',
      'vedamatch://auth/',
      'vedamatch-dev://evil',
      'vedamatch-devx://auth',
    ]) {
      expect(() =>
        parseAppLoginRequest({ appRedirect, appChallenge: RFC_CHALLENGE }),
      ).toThrow(AppLoginRequestError);
    }
  });

  it('не молчит, если пришла только половина параметров', () => {
    expect(() =>
      parseAppLoginRequest({ appRedirect: APP_REDIRECT_URIS[0] }),
    ).toThrow('PKCE');
    expect(() => parseAppLoginRequest({ appChallenge: RFC_CHALLENGE })).toThrow(
      'адрес',
    );
  });

  it('отвергает challenge не того формата', () => {
    for (const appChallenge of [
      'short',
      `${RFC_CHALLENGE}=`,
      RFC_CHALLENGE.replace('-', '+'),
      ['x'],
    ]) {
      expect(() =>
        parseAppLoginRequest({ appRedirect: 'vedamatch://auth', appChallenge }),
      ).toThrow(AppLoginRequestError);
    }
  });
});

describe('PKCE S256', () => {
  it('совпадает с примером RFC 7636', () => {
    expect(pkceChallengeS256(RFC_VERIFIER)).toBe(RFC_CHALLENGE);
    expect(verifyPkceS256(RFC_VERIFIER, RFC_CHALLENGE)).toBe(true);
  });

  it('отвергает чужой, короткий или нестроковый верификатор', () => {
    expect(verifyPkceS256(`${RFC_VERIFIER.slice(0, -1)}Y`, RFC_CHALLENGE)).toBe(
      false,
    );
    expect(verifyPkceS256('too-short', RFC_CHALLENGE)).toBe(false);
    expect(verifyPkceS256(undefined, RFC_CHALLENGE)).toBe(false);
    expect(verifyPkceS256('a'.repeat(129), RFC_CHALLENGE)).toBe(false);
  });
});

describe('appRedirectUrl', () => {
  it('кладёт код в query', () => {
    expect(appRedirectUrl('vedamatch://auth', { code: 'abc' })).toBe(
      'vedamatch://auth?code=abc',
    );
  });

  it('кодирует и обрезает текст ошибки', () => {
    const url = new URL(
      appRedirectUrl('vedamatch://auth', { error: 'Регистрация закрыта&x=1' }),
    );
    expect(url.searchParams.get('error')).toBe('Регистрация закрыта&x=1');
    expect(url.searchParams.get('x')).toBeNull();
    const long = new URL(
      appRedirectUrl('vedamatch://auth', { error: 'я'.repeat(500) }),
    );
    expect(long.searchParams.get('error')).toHaveLength(200);
  });
});
