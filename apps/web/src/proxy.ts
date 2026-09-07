import { NextRequest, NextResponse } from "next/server";

// Поддержка, заявки в команду и правовые документы обязаны открываться без
// входа: форма тикета и форма заявки нужны как раз тем, кто не может войти.
// "/services" — публичные страницы с
// описанием каждого сервиса и кнопкой регистрации: их и должны читать гости,
// иначе клик «Узнать больше» на лендинге мгновенно перекидывает на логин без
// единого слова о том, что вообще регистрируешь. "/vaishnava" — лендинг для
// преданных под отдельный поддомен: его читают до входа по определению.
const publicPrefixes = [
  "/login",
  "/mentor-verification",
  "/m/",
  "/support",
  "/team",
  "/legal",
  "/updates",
  "/services",
  "/vaishnava",
];
// Воркер, манифест и офлайн-оболочки обязаны отдаваться и гостю: без них
// приложение не устанавливается и не кэшируется при первом визите.
//
// Сюда же обязан попадать любой статический файл из public/, кроме картинок:
// matcher ниже исключает только svg|png|jpg|ico, поэтому .js проходит через
// гард и гость получает HTML лендинга вместо скрипта — с падением
// «Unexpected token '<'». Ровно так и потерялся pwa-install-prompt.js.
// Список сверяется с диском в proxy.spec.ts.
const publicFiles = new Set([
  "/gitabase",
  "/sw.js",
  "/pwa-install-prompt.js",
  "/manifest.webmanifest",
  "/offline",
  "/vedabase/offline",
]);

/**
 * Не-httpOnly маркер сессии от API (см. lib/session-marker.ts). Refresh-cookie
 * живёт на `path=/auth` и здесь не видна, а маркер — да: по нему вошедшего с
 * истёкшим access не гоним на лендинг, а пропускаем — страница сама покажет
 * splash и тихо обновит токен.
 */
const SESSION_MARKER = "vm_session";
/** Зеркало PATHNAME_HEADER в lib/require-user.ts (proxy не импортирует серверный код). */
const PATHNAME_HEADER = "x-pathname";

/**
 * Реферальная cookie и отпечаток устройства. Зеркало REWARDS_REF_COOKIE и
 * REWARDS_DEVICE_COOKIE из @vedamatch/shared — proxy держит свои копии
 * констант по той же причине, что и заголовок выше.
 *
 * Код кладётся здесь, а не на странице: человек с реферальной ссылкой чаще
 * всего сразу уходит смотреть портал, и до рендера лендинга дело может не
 * дойти. Живёт 30 дней — столько же, сколько человек обычно думает.
 */
const REF_COOKIE = "vm_ref";
const DEVICE_COOKIE = "vm_fp";
const REF_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;
const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
/**
 * Грубая проверка формы кода: семь символов из латиницы и цифр. Точный
 * алфавит знает API (rewards-code.ts) — здесь важно только не записывать в
 * cookie произвольную строку из адресной строки.
 */
const REF_CODE = /^[A-Za-z0-9]{7}$/;

/**
 * Поддомен лендинга для вайшнавов: `vaishnava.vedamatch.ru` (в разработке —
 * `vaishnava.localhost:3000`). Префикс, а не полный хост: домен портала
 * задаётся снаружи, а proxy серверные переменные не читает.
 */
const VAISHNAVA_HOST_PREFIX = "vaishnava.";

export function proxy(req: NextRequest) {
  const subdomain = vaishnavaSubdomainResponse(req);
  if (subdomain) return subdomain;

  const hasAccess = req.cookies.has("access_token");
  const hasSessionMarker = req.cookies.has(SESSION_MARKER);
  const isPublic =
    req.nextUrl.pathname === "/" ||
    publicFiles.has(req.nextUrl.pathname) ||
    publicPrefixes.some((prefix) => req.nextUrl.pathname.startsWith(prefix));

  if (!hasAccess && !isPublic && !hasSessionMarker) {
    const landingUrl = new URL("/", req.url);
    landingUrl.searchParams.set(
      "returnTo",
      `${req.nextUrl.pathname}${req.nextUrl.search}`,
    );
    return NextResponse.redirect(landingUrl);
  }
  if (hasAccess && req.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  // Серверным layout'ам путь запроса недоступен, а guard в (portal)/layout.tsx
  // должен вернуть человека на ту же страницу после входа. Пробрасываем путь
  // заголовком — читается в lib/require-user.ts.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(
    PATHNAME_HEADER,
    `${req.nextUrl.pathname}${req.nextUrl.search}`,
  );
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  rememberReferral(req, response);
  return response;
}

/**
 * Поддомен вайшнавов показывает лендинг корнем, а всё остальное отдаёт
 * основному домену.
 *
 * Корень переписывается на `/vaishnava` без смены адреса: в строке браузера
 * и в ссылках остаётся `vaishnava.vedamatch.ru/`. Сам `/vaishnava` на
 * поддомене — дубль корня, его сводим к `/`, чтобы у страницы был один адрес.
 *
 * Любой другой путь — вход, страницы сервисов, поддержка — уходит редиректом
 * на основной домен с тем же путём. Cookie сессии и OAuth-колбэки живут там,
 * и вести человека по порталу с поддомена значило бы держать два входа.
 * Порт хоста сохраняется: в разработке это `localhost:3000`.
 */
export function vaishnavaSubdomainResponse(
  req: NextRequest,
): NextResponse | null {
  const host = req.headers.get("host") ?? req.nextUrl.host;
  if (!host.startsWith(VAISHNAVA_HOST_PREFIX)) return null;

  const { pathname, search } = req.nextUrl;
  if (pathname === "/") {
    const response = NextResponse.rewrite(
      new URL(`/vaishnava${search}`, req.url),
    );
    rememberReferral(req, response);
    return response;
  }
  if (pathname === "/vaishnava") {
    return NextResponse.redirect(publicUrl(req, host, `/${search}`));
  }
  return NextResponse.redirect(
    publicUrl(req, host, `${pathname}${search}`, host.slice(VAISHNAVA_HOST_PREFIX.length)),
  );
}

/**
 * Адрес, каким его видит браузер. `req.url` за обратным прокси может
 * содержать внутренний хост и схему, поэтому хост берётся из заголовка
 * `Host`, а схема — из `X-Forwarded-Proto`, когда он есть.
 */
function publicUrl(
  req: NextRequest,
  host: string,
  pathWithSearch: string,
  targetHost: string = host,
): URL {
  const url = new URL(pathWithSearch, req.url);
  url.host = targetHost;
  const proto = req.headers.get("x-forwarded-proto");
  if (proto === "https" || proto === "http") url.protocol = `${proto}:`;
  return url;
}

/**
 * Запомнить реферальный код из `?ref=` и завести отпечаток устройства.
 *
 * Обе cookie не httpOnly: их читает карточка входа, чтобы передать код в
 * `/auth/google` — веб и API живут на разных доменах, и общей cookie между
 * ними может не быть. Секрета в них нет: код и так стоит в адресной строке,
 * а отпечаток — случайный идентификатор без данных о человеке.
 *
 * Первый код выигрывает: перезаписывать его вторым переходом значило бы
 * отдавать приглашённого тому, кто последним прислал ссылку.
 */
export function rememberReferral(req: NextRequest, res: NextResponse): void {
  const ref = req.nextUrl.searchParams.get("ref");
  if (ref && REF_CODE.test(ref) && !req.cookies.has(REF_COOKIE)) {
    res.cookies.set(REF_COOKIE, ref.toUpperCase(), {
      path: "/",
      maxAge: REF_COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }
  if (!req.cookies.has(DEVICE_COOKIE)) {
    res.cookies.set(DEVICE_COOKIE, crypto.randomUUID(), {
      path: "/",
      maxAge: DEVICE_COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  }
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|ico)).*)"],
};
