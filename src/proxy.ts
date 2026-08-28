import { NextResponse, type NextRequest } from "next/server";

// Cookie name — kept in sync with src/lib/session.ts (can't import it here
// because session.ts has "server-only" which may break in Edge runtime).
const SESSION_COOKIE = "xsta_session";

// Routes that require a session. Anything else is public (homepage, login,
// signup, the embedded form endpoint, the cron route).
const PROTECTED = ["/dashboard", "/leads", "/pipeline", "/reports", "/settings", "/team", "/tasks", "/sequences", "/follow-ups", "/billing", "/admin"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtected) return NextResponse.next();

  const hasSession = request.cookies.has(SESSION_COOKIE);

  // If already logged in and hitting /login or /signup, bounce to the app.
  if ((pathname === "/login" || pathname === "/signup") && hasSession) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets and the embedded-form / cron APIs
  // (which are public and validated by token instead).
  matcher: [
    "/((?!api/embed|api/cron|api/timeline|_next/static|_next/image|favicon.ico|.*\\.svg$).*)",
  ],
};
