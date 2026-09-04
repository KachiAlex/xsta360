import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// Lazy: don't throw at module load time (breaks Vercel build phase).
// Only throw when actually creating/verifying a session at runtime.
function getEncodedKey(): Uint8Array {
  const secretKey = process.env.SESSION_SECRET;
  if (!secretKey) {
    throw new Error("SESSION_SECRET is not set. Copy .env.example to .env.local.");
  }
  return new TextEncoder().encode(secretKey);
}

export interface SessionPayload {
  userId: string;
  // Current org the user is operating in (a user may belong to several).
  orgId: string;
  role: "admin" | "manager" | "rep";
  // Platform-level superadmin flag — bypasses org-scoping for /admin routes.
  isSuperadmin: boolean;
  // Incremented on password change / suspension to invalidate old sessions.
  tokenVersion: number;
  expiresAt: number; // ms epoch
}

const COOKIE = "xsta_session";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function encrypt(payload: Omit<SessionPayload, "expiresAt">) {
  const expiresAt = Date.now() + MAX_AGE_MS;
  return new SignJWT({ ...payload, expiresAt })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getEncodedKey());
}

export async function decrypt(
  token: string | undefined = "",
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getEncodedKey(), {
      algorithms: ["HS256"],
    });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/** Whether the app is served over HTTPS (determines cookie `secure` flag). */
function isHttps(): boolean {
  // Derive from APP_URL so HTTP deployments (e.g. VPS without TLS) still work.
  const appUrl = process.env.APP_URL ?? "";
  if (appUrl) return appUrl.startsWith("https://");
  // Fallback: assume production is HTTPS unless explicitly HTTP.
  return process.env.NODE_ENV === "production";
}

/** Create a session cookie for the given user + org + role. */
export async function createSession(
  payload: Omit<SessionPayload, "expiresAt">,
) {
  const expiresAt = new Date(Date.now() + MAX_AGE_MS);
  const session = await encrypt(payload);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE, session, {
    httpOnly: true,
    secure: isHttps(),
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

/** Switch the active organization for the current session. */
export async function setOrg(orgId: string, role: SessionPayload["role"]) {
  const current = await getCurrentPayload();
  if (!current) return;
  await createSession({
    userId: current.userId,
    orgId,
    role,
    isSuperadmin: current.isSuperadmin,
    tokenVersion: current.tokenVersion,
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE);
}

/** Read + verify the session payload from the cookie (no DB hit). */
export async function getCurrentPayload(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return decrypt(cookieStore.get(COOKIE)?.value);
}

export const SESSION_COOKIE = COOKIE;
