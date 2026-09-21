import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/firebase/constants";

/**
 * Edge-safe fast path only: this just checks whether a session cookie is
 * present, since verifying it (Firebase Admin, Node crypto) can't run on
 * the Edge runtime. The authoritative check — cryptographic verification
 * *and* role — happens server-side on every request via
 * requireUser()/requireRole() in src/lib/session.ts (called from every
 * dashboard/exam layout and server action). A forged or stale cookie gets
 * past this middleware but is rejected there.
 */
const AUTH_ROUTES = ["/login", "/register", "/forgot-password"];

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoggedIn = request.cookies.has(SESSION_COOKIE_NAME);

  const isStudentRoute = pathname.startsWith("/student");
  const isTeacherRoute = pathname.startsWith("/teacher");
  const isOnboardingRoute = pathname.startsWith("/onboarding");
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (!isLoggedIn && (isStudentRoute || isTeacherRoute || isOnboardingRoute)) {
    const loginUrl = new URL("/login", request.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isLoggedIn && isAuthRoute) {
    // Role is unknown at this layer — send them home and let the root page
    // (which does verify) route to the correct dashboard.
    return NextResponse.redirect(new URL("/", request.nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
