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
  isSuperadmin: boolean;
}

/**
 * Verify the session and load the membership row from the DB to confirm the
 * user still belongs to the active org with the claimed role. Returns null if
 * unauthenticated (caller decides to redirect or render public UI).
 */
export async function verifySession(): Promise<AuthContext | null> {
  const payload = await getCurrentPayload();
  if (!payload) return null;

  // Superadmins don't have a membership row — verify directly from DB.
  if (payload.isSuperadmin) {
    const [user] = await db
      .select({ id: schema.users.id, isSuperadmin: schema.users.isSuperadmin, suspendedAt: schema.users.suspendedAt })
      .from(schema.users)
      .where(eq(schema.users.id, payload.userId))
      .limit(1);
    if (!user || !user.isSuperadmin || user.suspendedAt) return null;
    return {
      session: payload,
      userId: payload.userId,
      orgId: payload.orgId,
      role: "admin",
      isSuperadmin: true,
    };
  }

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
    isSuperadmin: false,
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

/**
 * Require a platform superadmin session. Redirects to /login if not
 * authenticated, or /dashboard if authenticated but not a superadmin.
 */
export async function requireSuperadmin(): Promise<AuthContext> {
  const ctx = await verifySession();
  if (!ctx) redirect("/login");
  if (!ctx.isSuperadmin) redirect("/dashboard");
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

// ---------------------------------------------------------------------------
// Plan / subscription helpers
// ---------------------------------------------------------------------------

export interface OrgPlan {
  planId: string;
  planName: string;
  status: SubscriptionStatus | null;
  maxUsers: number;
  maxLeads: number;
  features: Record<string, unknown>;
  trialEndsAt: Date | null;
}

import type { SubscriptionStatus } from "@/db/schema";

/**
 * Load the plan + subscription for an org. Returns a default "free" plan
 * if no subscription exists (so the app works without billing setup).
 */
export async function getOrgPlan(orgId: string): Promise<OrgPlan> {
  const [sub] = await db
    .select({
      planId: schema.plans.id,
      planName: schema.plans.name,
      status: schema.subscriptions.status,
      maxUsers: schema.plans.maxUsers,
      maxLeads: schema.plans.maxLeads,
      features: schema.plans.features,
      trialEndsAt: schema.subscriptions.trialEndsAt,
    })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
    .where(eq(schema.subscriptions.orgId, orgId))
    .limit(1);

  if (sub) {
    return {
      planId: sub.planId,
      planName: sub.planName,
      status: sub.status,
      maxUsers: sub.maxUsers,
      maxLeads: sub.maxLeads,
      features: sub.features as Record<string, unknown>,
      trialEndsAt: sub.trialEndsAt,
    };
  }

  // No subscription — return unlimited defaults (pre-billing behavior).
  return {
    planId: "none",
    planName: "Free",
    status: null,
    maxUsers: -1,
    maxLeads: -1,
    features: {},
    trialEndsAt: null,
  };
}
