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

  // Re-confirm membership is still valid (user may have been removed / demoted / suspended).
  const [membership] = await db
    .select({
      id: schema.memberships.id,
      role: schema.memberships.role,
      suspendedAt: schema.users.suspendedAt,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(
      and(
        eq(schema.memberships.userId, payload.userId),
        eq(schema.memberships.orgId, payload.orgId),
      ),
    )
    .limit(1);

  if (!membership) return null;

  // Suspended users cannot access the app.
  if (membership.suspendedAt) return null;

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
  basePriceMonthly: number;
  perSeatPriceMonthly: number;
  trialDays: number;
  currency: string;
  features: Record<string, unknown>;
  trialEndsAt: Date | null;
}

import type { SubscriptionStatus } from "@/db/schema";
import { count as countFn } from "drizzle-orm";

/**
 * Whether the org's subscription blocks access to the app.
 * Blocked when: past_due, canceled, or trialing past trialEndsAt.
 * No subscription row (pre-billing orgs) is allowed through.
 */
export async function isSubscriptionBlocked(orgId: string): Promise<boolean> {
  const [sub] = await db
    .select({
      status: schema.subscriptions.status,
      trialEndsAt: schema.subscriptions.trialEndsAt,
      graceEndsAt: schema.subscriptions.graceEndsAt,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.orgId, orgId))
    .limit(1);

  if (!sub) return false;
  const now = new Date();
  if (sub.status === "canceled") return true;
  // past_due has a grace window — access continues until graceEndsAt passes.
  if (sub.status === "past_due") {
    return !sub.graceEndsAt || sub.graceEndsAt <= now;
  }
  if (sub.status === "trialing" && sub.trialEndsAt && sub.trialEndsAt < now) return true;
  return false;
}

/** Max members allowed by the plan's features.max_members flag (null = unlimited). */
export function getPlanMaxMembers(plan: OrgPlan): number | null {
  const v = (plan.features as Record<string, unknown>)?.max_members;
  return typeof v === "number" ? v : null;
}

/**
 * Check a feature flag on the plan (e.g. "reports", "sequences").
 * Locked only when the flag is explicitly `false` — orgs without a
 * subscription (pre-billing) or plans that don't declare the flag
 * keep access.
 */
export function planHasFeature(plan: OrgPlan, key: string): boolean {
  return (plan.features as Record<string, unknown>)?.[key] !== false;
}

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
      basePriceMonthly: schema.plans.basePriceMonthly,
      perSeatPriceMonthly: schema.plans.perSeatPriceMonthly,
      trialDays: schema.plans.trialDays,
      currency: schema.plans.currency,
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
      basePriceMonthly: sub.basePriceMonthly,
      perSeatPriceMonthly: sub.perSeatPriceMonthly,
      trialDays: sub.trialDays,
      currency: sub.currency,
      features: sub.features as Record<string, unknown>,
      trialEndsAt: sub.trialEndsAt,
    };
  }

  // No subscription — return defaults (pre-billing behavior).
  return {
    planId: "none",
    planName: "Free",
    status: null,
    basePriceMonthly: 0,
    perSeatPriceMonthly: 0,
    trialDays: 0,
    currency: "₦",
    features: {},
    trialEndsAt: null,
  };
}

/**
 * Compute the monthly billing amount for an org based on its plan + member count.
 * Formula: basePrice + (memberCount - 1) * perSeatPrice
 * (The workspace admin is the base; additional members are per-seat.)
 */
export async function getOrgBilling(orgId: string): Promise<{
  plan: OrgPlan;
  memberCount: number;
  monthlyAmount: number;
  trialEndsAt: Date | null;
  daysLeftInTrial: number | null;
}> {
  const plan = await getOrgPlan(orgId);

  const [memberRow] = await db
    .select({ value: countFn() })
    .from(schema.memberships)
    .where(eq(schema.memberships.orgId, orgId));

  const memberCount = memberRow?.value ?? 0;
  // Base covers the admin (1 seat). Additional members are per-seat.
  const additionalSeats = Math.max(0, memberCount - 1);
  const monthlyAmount = plan.basePriceMonthly + additionalSeats * plan.perSeatPriceMonthly;

  let daysLeftInTrial: number | null = null;
  if (plan.trialEndsAt) {
    const ms = plan.trialEndsAt.getTime() - Date.now();
    daysLeftInTrial = Math.ceil(ms / (1000 * 60 * 60 * 24));
  }

  return {
    plan,
    memberCount,
    monthlyAmount,
    trialEndsAt: plan.trialEndsAt,
    daysLeftInTrial,
  };
}
