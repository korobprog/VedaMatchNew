import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const hasAccess = req.cookies.has("access_token");
  const isLogin = req.nextUrl.pathname === "/login";

  if (!hasAccess && !isLogin) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (hasAccess && isLogin) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|ico)).*)"],
};
