import { publicOrigin } from '../../common/public-origin';
import { portalHost } from './portal-host';

/**
 * Контур, в котором идёт вход: адрес API, адрес портала и домен для cookie.
 *
 * Портал живёт на двух доменах — российском `vedamatch.ru` и глобальном
 * `vedamatch.com`. До этого адрес API брался из `API_PUBLIC_URL`, а домен
 * cookie из `COOKIE_DOMAIN` — по одному значению на весь сервис. Вход,
 * начатый на `.com`, поэтому уезжал в чужой контур: `redirect_uri` уходил в
 * Google на `api.vedamatch.ru`, колбэк приходил туда же, cookie вставала на
 * `.vedamatch.ru`, и человек оказывался на российском портале. Хуже того,
 * cookie с `Domain=.vedamatch.ru`, выставленная с хоста `api.vedamatch.com`,
 * браузером просто отбрасывается — OAuth-сессия терялась между шагами.
 *
 * Поэтому контур определяется по хосту запроса. Хост из заголовка — данные
 * от клиента, и `redirect_uri` на их основе — классическая host header
 * injection, поэтому он сверяется со списком `WEB_ORIGIN`: контур существует
 * только если портал этого хоста разрешён настройкой. Всё остальное —
 * localhost, превью-деплои, вход по адресу сервера — работает как раньше, на
 * значениях переменных.
 */
export type Contour = {
  /** Публичный адрес API: `https://api.vedamatch.com`. */
  apiOrigin: string;
  /** Адрес портала для возврата после входа: `https://vedamatch.com`. */
  webOrigin: string;
  /** Домен cookie: `.vedamatch.com`, либо `undefined` — только этот хост. */
  cookieDomain: string | undefined;
};

export type ContourInput = {
  /** `req.headers.host` или `req.hostname`; может быть с портом. */
  host: string | null | undefined;
  /** Значение `WEB_ORIGIN`: список адресов портала через запятую. */
  webOrigins: string | null | undefined;
  /** `API_PUBLIC_URL` — ответ для незнакомых хостов. */
  fallbackApiOrigin: string;
  /** `COOKIE_DOMAIN` — он же признак «cookie на весь домен, не только хост». */
  fallbackCookieDomain: string | undefined;
};

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function resolveContour(input: ContourInput): Contour {
  const fallback: Contour = {
    apiOrigin: input.fallbackApiOrigin,
    webOrigin: publicOrigin(input.webOrigins) ?? 'http://localhost:3000',
    cookieDomain: input.fallbackCookieDomain,
  };

  if (typeof input.host !== 'string') return fallback;
  const host = input.host.trim().toLowerCase().split(':')[0];
  if (host.length === 0) return fallback;
  /* Контур узнаётся только по API-хосту: на портальном домене эти адреса
     никто не собирает, а `api.` — единственный признак, по которому можно
     вернуться к порталу, не угадывая. */
  if (!host.startsWith('api.')) return fallback;

  const portal = portalHost(host);
  const matched = (input.webOrigins ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .find((origin) => hostOf(origin) === portal);
  /* Незнакомый портал — не наш контур: собирать для него `redirect_uri`
     значило бы доверять заголовку запроса. */
  if (!matched) return fallback;
  /* По http контуров не бывает: OAuth-колбэк и cookie ходят только под
     TLS, а локальная разработка обслуживается ветвью выше. */
  if (!matched.startsWith('https://')) return fallback;

  return {
    apiOrigin: `https://${host}`,
    webOrigin: matched,
    /* Пустой `COOKIE_DOMAIN` — осознанная настройка «cookie только этому
       хосту»: её нельзя молча превращать в общий домен контура. */
    cookieDomain: input.fallbackCookieDomain ? `.${portal}` : undefined,
  };
}
