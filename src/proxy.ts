import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Cookie name — kept in sync with src/lib/session.ts (can't import it here
// because session.ts has "server-only" which may break in Edge runtime).
const SESSION_COOKIE = "xsta_session";

// Verify the JWT using the same secret as src/lib/session.ts.
// jose works in Edge runtime; returns true only for a valid, unexpired token.
async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });
    return true;
  } catch {
    return false;
  }
}

// Routes that require a session. Anything else is public (homepage, login,
// signup, the embedded form endpoint, the cron route).
const PROTECTED = ["/dashboard", "/leads", "/pipeline", "/reports", "/settings", "/team", "/tasks", "/sequences", "/follow-ups", "/billing", "/contact-card", "/admin"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtected) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const hasSession = await isValidSession(token);

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
