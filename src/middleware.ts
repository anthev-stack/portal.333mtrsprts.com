import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/jwt";

const PUBLIC_PATHS = new Set([
  "/login",
  "/reset-password",
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/f/")) return true;
  if (pathname.startsWith("/api/auth/login")) return true;
  if (pathname.startsWith("/api/auth/logout")) return true;
  if (pathname.startsWith("/api/health")) return true;
  if (pathname.startsWith("/api/forms/public/")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/uploads") ||
    pathname.match(/\.(ico|png|jpg|jpeg|svg|webp|gif)$/)
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    if (isPublicPath(pathname)) return NextResponse.next();
    return NextResponse.next();
  }

  if (pathname === "/") {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    const session = token ? await verifySessionToken(token) : null;
    const url = request.nextUrl.clone();
    url.pathname = session ? "/home" : "/login";
    return NextResponse.redirect(url);
  }

  if (isPublicPath(pathname)) {
    if (pathname === "/login") {
      const token = request.cookies.get(COOKIE_NAME)?.value;
      const session = token ? await verifySessionToken(token) : null;
      if (session) {
        const url = request.nextUrl.clone();
        url.pathname = "/home";
        return NextResponse.redirect(url);
      }
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (
    (pathname.startsWith("/forms") || pathname.startsWith("/admin")) &&
    session.role !== "ADMIN"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
