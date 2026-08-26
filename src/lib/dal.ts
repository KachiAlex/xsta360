import "server-only";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCurrentPayload, type SessionPayload } from "@/lib/session";
import type { Role } from "@/db/schema";

export interface AuthContext {
  session: SessionPayload;
  userId: string;
  orgId: string;
  role: Role;
}

/**
 * Verify the session and load the membership row from the DB to confirm the
 * user still belongs to the active org with the claimed role. Returns null if
 * unauthenticated (caller decides to redirect or render public UI).
 */
export async function verifySession(): Promise<AuthContext | null> {
  const payload = await getCurrentPayload();
  if (!payload) return null;

  // Re-confirm membership is still valid (user may have been removed / demoted).
  const [membership] = await db
    .select()
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.userId, payload.userId),
        eq(schema.memberships.orgId, payload.orgId),
      ),
    )
    .limit(1);

  if (!membership) return null;

  // Keep the session role in sync with the DB in case it changed.
  if (membership.role !== payload.role) {
    const { setOrg } = await import("@/lib/session");
    await setOrg(payload.orgId, membership.role);
  }

  return {
    session: payload,
    userId: payload.userId,
    orgId: payload.orgId,
    role: membership.role,
  };
}

/**
 * Require an authenticated session; redirect to /login otherwise.
 * Use in pages/layouts where the whole route is protected.
 */
export async function requireAuth(): Promise<AuthContext> {
  const ctx = await verifySession();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Require one of the given roles; redirect to dashboard if lacking. */
export async function requireRole(...roles: Role[]): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (!roles.includes(ctx.role)) redirect("/dashboard");
  return ctx;
}

/** Role capability helper for guards inside server actions. */
export function can(ctx: AuthContext, action: "manage_team" | "assign" | "configure"): boolean {
  switch (action) {
    case "manage_team":
    case "configure":
      return ctx.role === "admin";
    case "assign":
      return ctx.role === "admin" || ctx.role === "manager";
  }
}
