import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

// Routes that require a session. Anything else is public (homepage, login,
// signup, the embedded form endpoint, the cron route).
const PROTECTED = ["/dashboard", "/leads", "/pipeline", "/reports", "/settings", "/team"];

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
    "/((?!api/embed|api/cron|_next/static|_next/image|favicon.ico|.*\\.svg$).*)",
  ],
};
