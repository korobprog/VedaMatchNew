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

export function proxy(req: NextRequest) {
  const hasAccess = req.cookies.has("access_token");
  const isPublic =
    req.nextUrl.pathname === "/" ||
    publicFiles.has(req.nextUrl.pathname) ||
    publicPrefixes.some((prefix) => req.nextUrl.pathname.startsWith(prefix));

  if (!hasAccess && !isPublic) {
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
