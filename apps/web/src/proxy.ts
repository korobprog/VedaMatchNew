import { NextRequest, NextResponse } from "next/server";

const publicPrefixes = ["/login", "/mentor-verification"];

export function proxy(req: NextRequest) {
  const hasAccess = req.cookies.has("access_token");
  const isPublic = publicPrefixes.some((prefix) =>
    req.nextUrl.pathname.startsWith(prefix),
  );

  if (!hasAccess && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (hasAccess && req.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|ico)).*)"],
};
