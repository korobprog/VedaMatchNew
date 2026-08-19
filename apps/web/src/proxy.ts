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
const publicFiles = new Set([
  "/gitabase",
  "/sw.js",
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
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|ico)).*)"],
};
