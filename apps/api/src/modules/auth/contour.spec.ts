import { resolveContour } from './contour';

const WEB_ORIGINS =
  'https://vedamatch.ru,https://vedamatch.com,https://www.vedamatch.com';

function contour(host: string | null | undefined, webOrigins = WEB_ORIGINS) {
  return resolveContour({
    host,
    webOrigins,
    fallbackApiOrigin: 'https://api.vedamatch.ru',
    fallbackCookieDomain: '.vedamatch.ru',
  });
}

describe('resolveContour', () => {
  it('российский контур остаётся собой', () => {
    expect(contour('api.vedamatch.ru')).toEqual({
      apiOrigin: 'https://api.vedamatch.ru',
      webOrigin: 'https://vedamatch.ru',
      cookieDomain: '.vedamatch.ru',
    });
  });

  it('глобальный контур не уезжает в российский', () => {
    // Ради этого всё и затевалось: раньше redirect_uri, возврат и cookie
    // брались из переменных и всегда указывали на .ru.
    expect(contour('api.vedamatch.com')).toEqual({
      apiOrigin: 'https://api.vedamatch.com',
      webOrigin: 'https://vedamatch.com',
      cookieDomain: '.vedamatch.com',
    });
  });

  it('порт и регистр в заголовке не мешают', () => {
    expect(contour('API.VedaMatch.COM:443').webOrigin).toBe(
      'https://vedamatch.com',
    );
  });

  it('чужой хост в заголовке не становится контуром', () => {
    // Host приезжает от клиента, а redirect_uri уходит в Google:
    // доверять заголовку нельзя, спасает сверка с WEB_ORIGIN.
    expect(contour('api.evil.example')).toEqual({
      apiOrigin: 'https://api.vedamatch.ru',
      webOrigin: 'https://vedamatch.ru',
      cookieDomain: '.vedamatch.ru',
    });
  });

  it('портальный домен контуром не считается', () => {
    // На vedamatch.com эти адреса никто не собирает, а угадывать
    // «портал → API» нельзя: поддомен может быть любым.
    expect(contour('vedamatch.com').apiOrigin).toBe('https://api.vedamatch.ru');
  });

  it('локальная разработка работает по-старому', () => {
    const local = resolveContour({
      host: 'localhost:4000',
      webOrigins: 'http://localhost:3000',
      fallbackApiOrigin: 'http://localhost:4000',
      fallbackCookieDomain: undefined,
    });
    expect(local).toEqual({
      apiOrigin: 'http://localhost:4000',
      webOrigin: 'http://localhost:3000',
      cookieDomain: undefined,
    });
  });

  it('контур по http не собирается', () => {
    // Единственный http-портал в списке — локальный, и для него уже есть
    // ветка выше; под TLS ходят и колбэк, и cookie.
    expect(contour('api.vedamatch.com', 'http://vedamatch.com').webOrigin).toBe(
      'http://vedamatch.com',
    );
    expect(contour('api.vedamatch.com', 'http://vedamatch.com').apiOrigin).toBe(
      'https://api.vedamatch.ru',
    );
  });

  it('пустой COOKIE_DOMAIN остаётся пустым', () => {
    // Настройка «cookie только этому хосту» не превращается в общий домен.
    const c = resolveContour({
      host: 'api.vedamatch.com',
      webOrigins: WEB_ORIGINS,
      fallbackApiOrigin: 'https://api.vedamatch.ru',
      fallbackCookieDomain: undefined,
    });
    expect(c.cookieDomain).toBeUndefined();
    expect(c.webOrigin).toBe('https://vedamatch.com');
  });

  it('без заголовка хоста — прежние настройки', () => {
    expect(contour(undefined).apiOrigin).toBe('https://api.vedamatch.ru');
    expect(contour(null).webOrigin).toBe('https://vedamatch.ru');
    expect(contour('   ').cookieDomain).toBe('.vedamatch.ru');
  });
});
