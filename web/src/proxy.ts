import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optimistic redirect only: send visitors without a session cookie to the login page.
 * The API is the real authority — it returns 401 for missing or invalid sessions, and
 * AuthGuard handles that on the client.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("pm_session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/exams/:path*",
    "/practice/:path*",
    "/mock-tests/:path*",
    "/attempts/:path*",
    "/materials/:path*",
    "/saved/:path*",
    "/analytics/:path*",
    "/leaderboard/:path*",
    "/subscription/:path*",
    "/checkout/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
};
