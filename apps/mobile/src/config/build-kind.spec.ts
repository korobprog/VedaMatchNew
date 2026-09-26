import {
  appIdentity,
  authRedirectFor,
  DEFAULT_SCHEME,
  firebaseConfigCovers,
  resolveBuildKind,
  schemeFromConfig,
} from './build-kind';

/**
 * Боевая сборка или сборка разработчика. Ошибка здесь стоит данных на
 * телефоне: боевой пакет с чужим versionCode не даёт поставить сборку с
 * сайта, и лечится это только удалением приложения (Samsung A51, 5025).
 */

describe('resolveBuildKind', () => {
  it('без переменной — сборка разработчика', () => {
    expect(resolveBuildKind({})).toBe('dev');
    expect(resolveBuildKind({ APP_BUILD_KIND: '  ' })).toBe('dev');
  });

  it('release и dev — явно', () => {
    expect(resolveBuildKind({ APP_BUILD_KIND: 'release' })).toBe('release');
    expect(resolveBuildKind({ APP_BUILD_KIND: ' dev ' })).toBe('dev');
  });

  it('опечатка — ошибка сборки, а не молчаливая догадка', () => {
    expect(() => resolveBuildKind({ APP_BUILD_KIND: 'production' })).toThrow(/APP_BUILD_KIND="production"/);
    expect(() => resolveBuildKind({ APP_BUILD_KIND: 'Release' })).toThrow();
  });
});

describe('appIdentity', () => {
  it('боевая — прежний пакет, имя и схема: ничего не меняется для сборок с сайта и витрин', () => {
    expect(appIdentity('release')).toEqual({
      androidPackage: 'com.vedamatch.app',
      name: 'VedaMatch',
      scheme: 'vedamatch',
    });
  });

  it('разработчика — свой пакет рядом с боевым, своё имя и своя схема', () => {
    const dev = appIdentity('dev');
    const release = appIdentity('release');
    expect(dev.androidPackage).toBe('com.vedamatch.app.dev');
    expect(dev.name).toBe('VedaMatch Dev');
    expect(dev.scheme).toBe('vedamatch-dev');
    expect(dev.androidPackage).not.toBe(release.androidPackage);
    expect(dev.scheme).not.toBe(release.scheme);
  });

  it('схемы — допустимые схемы URL (буква, затем буквы, цифры, «+», «-», «.»)', () => {
    for (const kind of ['release', 'dev'] as const) {
      expect(appIdentity(kind).scheme).toMatch(/^[a-z][a-z0-9+.-]*$/);
    }
  });
});

describe('адрес возврата после входа', () => {
  it('строится из схемы сборки', () => {
    expect(authRedirectFor('vedamatch')).toBe('vedamatch://auth');
    expect(authRedirectFor(appIdentity('dev').scheme)).toBe('vedamatch-dev://auth');
  });

  it('схема из собранного конфига: строка, массив или ничего', () => {
    expect(schemeFromConfig('vedamatch-dev')).toBe('vedamatch-dev');
    expect(schemeFromConfig(['vedamatch-dev', 'other'])).toBe('vedamatch-dev');
    expect(schemeFromConfig(undefined)).toBe(DEFAULT_SCHEME);
    expect(schemeFromConfig('')).toBe(DEFAULT_SCHEME);
    expect(DEFAULT_SCHEME).toBe('vedamatch');
  });
});

describe('firebaseConfigCovers', () => {
  const file = (...packages: string[]) => ({
    client: packages.map((package_name) => ({ client_info: { android_client_info: { package_name } } })),
  });

  it('пакет есть в файле — подключать можно', () => {
    expect(firebaseConfigCovers(file('com.vedamatch.app', 'com.vedamatch.app.dev'), 'com.vedamatch.app.dev')).toBe(true);
  });

  it('пакета нет — не подключать, иначе gradle упадёт', () => {
    expect(firebaseConfigCovers(file('com.vedamatch.app'), 'com.vedamatch.app.dev')).toBe(false);
  });

  it('мусор вместо файла — не подключать', () => {
    expect(firebaseConfigCovers(null, 'com.vedamatch.app.dev')).toBe(false);
    expect(firebaseConfigCovers({}, 'com.vedamatch.app.dev')).toBe(false);
    expect(firebaseConfigCovers({ client: [null, {}] }, 'com.vedamatch.app.dev')).toBe(false);
  });
});
