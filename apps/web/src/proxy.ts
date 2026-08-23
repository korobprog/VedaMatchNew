import { NextRequest, NextResponse } from "next/server";

// Поддержка и правовые документы обязаны открываться без входа: форма тикета
// нужна как раз тем, кто не может войти. "/services" — публичные страницы с
// описанием каждого сервиса и кнопкой регистрации: их и должны читать гости,
// иначе клик «Узнать больше» на лендинге мгновенно перекидывает на логин без
// единого слова о том, что вообще регистрируешь.
const publicPrefixes = [
  "/login",
  "/mentor-verification",
  "/m/",
  "/support",
  "/legal",
  "/updates",
  "/services",
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

export function proxy(req: NextRequest) {
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
