import {
  resolveContour,
  resolveReturnOrigin,
  returnOriginCandidate,
  type Contour,
} from './contour';

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

describe('resolveReturnOrigin', () => {
  const COM: Contour = {
    apiOrigin: 'https://api.vedamatch.com',
    webOrigin: 'https://vedamatch.com',
    cookieDomain: '.vedamatch.com',
  };
  const ORIGINS = `${WEB_ORIGINS},https://ios.vedamatch.com,https://evil.example`;

  function returnOrigin(
    requested: unknown,
    webOrigins = ORIGINS,
    contour: Contour = COM,
  ) {
    return resolveReturnOrigin({ requested, webOrigins, contour });
  }

  it('поддомен из списка того же контура принимается', () => {
    expect(returnOrigin('https://ios.vedamatch.com')).toBe(
      'https://ios.vedamatch.com',
    );
  });

  it('хвостовая косая не мешает совпадению', () => {
    expect(returnOrigin('https://ios.vedamatch.com/')).toBe(
      'https://ios.vedamatch.com',
    );
  });

  it('без запроса — портал контура', () => {
    expect(returnOrigin(undefined)).toBe('https://vedamatch.com');
    expect(returnOrigin('')).toBe('https://vedamatch.com');
    expect(returnOrigin(42)).toBe('https://vedamatch.com');
  });

  it('поддомена нет в WEB_ORIGIN — портал контура', () => {
    expect(returnOrigin('https://ios.vedamatch.com', WEB_ORIGINS)).toBe(
      'https://vedamatch.com',
    );
  });

  // Список WEB_ORIGIN общий для контуров, и CORS пускает любой его адрес.
  // Возврат — нет: cookie стоят на домене контура, чужой сайт их не увидит,
  // а открытый редирект на него — подарок фишингу.
  it('разрешённый в CORS, но чужой сайт — портал контура', () => {
    expect(returnOrigin('https://evil.example')).toBe('https://vedamatch.com');
  });

  it('портал другого контура — портал своего контура', () => {
    expect(returnOrigin('https://vedamatch.ru')).toBe('https://vedamatch.com');
  });

  it('похожий, но не тот домен — отказ', () => {
    expect(
      returnOrigin(
        'https://ios.vedamatch.com.evil.example',
        `${ORIGINS},https://ios.vedamatch.com.evil.example`,
      ),
    ).toBe('https://vedamatch.com');
    expect(
      returnOrigin(
        'https://notvedamatch.com',
        `${ORIGINS},https://notvedamatch.com`,
      ),
    ).toBe('https://vedamatch.com');
  });

  it('путь, запрос и учётные данные в адресе — отказ', () => {
    expect(returnOrigin('https://ios.vedamatch.com/chat')).toBe(
      'https://vedamatch.com',
    );
    expect(returnOrigin('https://ios.vedamatch.com?x=1')).toBe(
      'https://vedamatch.com',
    );
    expect(returnOrigin('https://user@ios.vedamatch.com')).toBe(
      'https://vedamatch.com',
    );
    expect(returnOrigin('javascript:alert(1)')).toBe('https://vedamatch.com');
  });

  it('http при https-контуре — отказ', () => {
    expect(
      returnOrigin(
        'http://ios.vedamatch.com',
        `${ORIGINS},http://ios.vedamatch.com`,
      ),
    ).toBe('https://vedamatch.com');
  });

  it('локальная разработка: другой порт localhost из списка принимается', () => {
    const local = {
      apiOrigin: 'http://localhost:4000',
      webOrigin: 'http://localhost:3000',
      cookieDomain: undefined,
    };
    expect(
      returnOrigin(
        'http://localhost:8093',
        'http://localhost:3000,http://localhost:8093',
        local,
      ),
    ).toBe('http://localhost:8093');
    expect(
      returnOrigin(
        'http://localhost:9999',
        'http://localhost:3000,http://localhost:8093',
        local,
      ),
    ).toBe('http://localhost:3000');
  });
});

// Кандидат едет в OIDC-cookie от старта входа до колбэка. Раньше его
// пропускали через shortToken, и адрес с «://» молча превращался в null.
describe('returnOriginCandidate', () => {
  it('сохраняет адрес как есть', () => {
    expect(returnOriginCandidate('https://ios.vedamatch.com')).toBe(
      'https://ios.vedamatch.com',
    );
    expect(returnOriginCandidate('  http://localhost:8093 ')).toBe(
      'http://localhost:8093',
    );
  });

  it('вместе с resolveReturnOrigin возвращает на поддомен', () => {
    expect(
      resolveReturnOrigin({
        requested: returnOriginCandidate('https://ios.vedamatch.com'),
        webOrigins: 'https://vedamatch.com,https://ios.vedamatch.com',
        contour: {
          apiOrigin: 'https://api.vedamatch.com',
          webOrigin: 'https://vedamatch.com',
          cookieDomain: '.vedamatch.com',
        },
      }),
    ).toBe('https://ios.vedamatch.com');
  });

  it('не строка, пусто, слишком длинно или с пробелами внутри — null', () => {
    expect(returnOriginCandidate(undefined)).toBeNull();
    expect(returnOriginCandidate(['https://a'])).toBeNull();
    expect(returnOriginCandidate('   ')).toBeNull();
    expect(returnOriginCandidate(`https://${'a'.repeat(200)}.com`)).toBeNull();
    expect(returnOriginCandidate('https://ios.vedamatch.com x')).toBeNull();
    expect(
      returnOriginCandidate(
        `https://ios.vedamatch.com${String.fromCharCode(10)}x`,
      ),
    ).toBeNull();
  });
});
