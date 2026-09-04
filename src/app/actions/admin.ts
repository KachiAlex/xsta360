"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, and, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/dal";
import { logEvent } from "@/lib/audit";

export type SubFormState = { message?: string; error?: boolean };

// ---------------------------------------------------------------------------
// Plans CRUD
// ---------------------------------------------------------------------------

const PlanSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").trim(),
  basePriceMonthly: z.coerce.number().int().min(0),
  perSeatPriceMonthly: z.coerce.number().int().min(0),
  trialDays: z.coerce.number().int().min(0),
  currency: z.string().min(1).max(3).default("₦"),
  features: z.string().optional(),
  position: z.coerce.number().int().min(0).default(0),
});

export async function createPlan(
  _prev: SubFormState,
  formData: FormData,
): Promise<SubFormState> {
  const ctx = await requireSuperadmin();
  const parsed = PlanSchema.safeParse({
    name: formData.get("name"),
    basePriceMonthly: formData.get("basePriceMonthly"),
    perSeatPriceMonthly: formData.get("perSeatPriceMonthly"),
    trialDays: formData.get("trialDays"),
    currency: formData.get("currency") ?? "₦",
    features: formData.get("features"),
    position: formData.get("position") ?? 0,
  });
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Invalid input", error: true };
  }

  let features = {};
  if (parsed.data.features) {
    try {
      features = JSON.parse(parsed.data.features);
    } catch {
      return { message: "Features must be valid JSON", error: true };
    }
  }

  try {
    const [plan] = await db
      .insert(schema.plans)
      .values({
        name: parsed.data.name,
        basePriceMonthly: parsed.data.basePriceMonthly,
        perSeatPriceMonthly: parsed.data.perSeatPriceMonthly,
        trialDays: parsed.data.trialDays,
        currency: parsed.data.currency,
        features,
        position: parsed.data.position,
      })
      .returning();

    await logEvent(null, "plan_created", {
      actorId: ctx.userId,
      meta: { planId: plan.id, name: plan.name },
    });
    revalidatePath("/admin/plans");
    return { message: `Plan "${plan.name}" created` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { message: `Failed: ${msg}`, error: true };
  }
}

export async function updatePlan(
  _prev: SubFormState,
  formData: FormData,
): Promise<SubFormState> {
  const ctx = await requireSuperadmin();
  const planId = formData.get("planId") as string;
  if (!planId) return { message: "Missing plan ID", error: true };

  const parsed = PlanSchema.safeParse({
    name: formData.get("name"),
    basePriceMonthly: formData.get("basePriceMonthly"),
    perSeatPriceMonthly: formData.get("perSeatPriceMonthly"),
    trialDays: formData.get("trialDays"),
    currency: formData.get("currency") ?? "₦",
    features: formData.get("features"),
    position: formData.get("position") ?? 0,
  });
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Invalid input", error: true };
  }

  let features = {};
  if (parsed.data.features) {
    try {
      features = JSON.parse(parsed.data.features);
    } catch {
      return { message: "Features must be valid JSON", error: true };
    }
  }

  try {
    await db
      .update(schema.plans)
      .set({
        name: parsed.data.name,
        basePriceMonthly: parsed.data.basePriceMonthly,
        perSeatPriceMonthly: parsed.data.perSeatPriceMonthly,
        trialDays: parsed.data.trialDays,
        currency: parsed.data.currency,
        features,
        position: parsed.data.position,
        updatedAt: new Date(),
      })
      .where(eq(schema.plans.id, planId));

    await logEvent(null, "plan_updated", {
      actorId: ctx.userId,
      meta: { planId, name: parsed.data.name },
    });
    revalidatePath("/admin/plans");
    return { message: "Plan updated" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { message: `Failed: ${msg}`, error: true };
  }
}

export async function deletePlan(
  _prev: SubFormState,
  formData: FormData,
): Promise<SubFormState> {
  const ctx = await requireSuperadmin();
  const planId = formData.get("planId") as string;
  if (!planId) return { message: "Missing plan ID", error: true };

  try {
    await db.delete(schema.plans).where(eq(schema.plans.id, planId));
    await logEvent(null, "plan_deleted", {
      actorId: ctx.userId,
      meta: { planId },
    });
    revalidatePath("/admin/plans");
    return { message: "Plan deleted" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { message: `Failed: ${msg}`, error: true };
  }
}

// ---------------------------------------------------------------------------
// Subscription management
// ---------------------------------------------------------------------------

export async function manageSubscription(
  _prev: SubFormState,
  formData: FormData,
): Promise<SubFormState> {
  const ctx = await requireSuperadmin();
  const orgId = formData.get("orgId") as string;
  const subId = (formData.get("subId") as string) || null;
  const planId = (formData.get("planId") as string) || null;
  const status = (formData.get("status") as string) as "trialing" | "active" | "past_due" | "canceled";

  if (!orgId) return { message: "Missing org ID", error: true };

  try {
    if (!planId) {
      // No plan selected — remove subscription if it exists.
      if (subId) {
        await db.delete(schema.subscriptions).where(eq(schema.subscriptions.id, subId));
        await logEvent(null, "subscription_canceled", {
          actorId: ctx.userId,
          meta: { orgId },
        });
      }
      revalidatePath(`/admin/orgs/${orgId}`);
      return { message: "Subscription removed — org is now on Free" };
    }

    if (subId) {
      // Update existing subscription.
      await db
        .update(schema.subscriptions)
        .set({ planId, status, updatedAt: new Date() })
        .where(eq(schema.subscriptions.id, subId));
      await logEvent(null, "subscription_updated", {
        actorId: ctx.userId,
        meta: { orgId, planId, status },
      });
    } else {
      // Create new subscription.
      await db.insert(schema.subscriptions).values({
        orgId,
        planId,
        status,
        trialEndsAt: status === "trialing" ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) : null,
      });
      await logEvent(null, "subscription_created", {
        actorId: ctx.userId,
        meta: { orgId, planId, status },
      });
    }

    revalidatePath(`/admin/orgs/${orgId}`);
    return { message: "Subscription saved" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { message: `Failed: ${msg}`, error: true };
  }
}

/**
 * Extend a trialing subscription's trial by N days.
 * Only valid while the subscription is still trialing.
 */
export async function extendTrial(
  _prev: SubFormState,
  formData: FormData,
): Promise<SubFormState> {
  const ctx = await requireSuperadmin();
  const orgId = formData.get("orgId") as string;
  const subId = formData.get("subId") as string;
  const days = parseInt(String(formData.get("days") ?? "7"), 10);

  if (!orgId || !subId) return { message: "Missing IDs", error: true };
  if (!Number.isFinite(days) || days < 1 || days > 90) {
    return { message: "Days must be between 1 and 90", error: true };
  }

  try {
    const [sub] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, subId))
      .limit(1);
    if (!sub) return { message: "Subscription not found", error: true };
    if (sub.status !== "trialing") {
      return { message: "Can only extend a trialing subscription", error: true };
    }

    const base = sub.trialEndsAt && sub.trialEndsAt > new Date() ? sub.trialEndsAt : new Date();
    const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    await db
      .update(schema.subscriptions)
      .set({ trialEndsAt: newEnd, currentPeriodEnd: newEnd, updatedAt: new Date() })
      .where(eq(schema.subscriptions.id, subId));

    await logEvent(null, "subscription_updated", {
      actorId: ctx.userId,
      meta: { orgId, action: "trial_extended", days, newEnd },
    });

    revalidatePath(`/admin/orgs/${orgId}`);
    return { message: `Trial extended by ${days} day${days !== 1 ? "s" : ""}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { message: `Failed: ${msg}`, error: true };
  }
}

/**
 * Manually mark a subscription as paid/active (e.g. for offline payments).
 * Sets currentPeriodEnd one month out and clears any grace window.
 */
export async function markSubscriptionPaid(
  _prev: SubFormState,
  formData: FormData,
): Promise<SubFormState> {
  const ctx = await requireSuperadmin();
  const orgId = formData.get("orgId") as string;
  const subId = formData.get("subId") as string;

  if (!orgId || !subId) return { message: "Missing IDs", error: true };

  try {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await db
      .update(schema.subscriptions)
      .set({
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        lastPaymentAt: now,
        graceEndsAt: null,
        updatedAt: now,
      })
      .where(eq(schema.subscriptions.id, subId));

    await logEvent(null, "subscription_updated", {
      actorId: ctx.userId,
      meta: { orgId, action: "marked_paid_manually" },
    });

    revalidatePath(`/admin/orgs/${orgId}`);
    return { message: "Marked as paid — subscription active for 1 month" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { message: `Failed: ${msg}`, error: true };
  }
}

// ---------------------------------------------------------------------------
// Suspend / reactivate org
// ---------------------------------------------------------------------------

export async function suspendOrg(
  _prev: SubFormState,
  formData: FormData,
): Promise<SubFormState> {
  const ctx = await requireSuperadmin();
  const orgId = formData.get("orgId") as string;
  if (!orgId) return { message: "Missing org ID", error: true };

  try {
    // Suspend all members of this org.
    const members = await db
      .select({ userId: schema.memberships.userId })
      .from(schema.memberships)
      .where(eq(schema.memberships.orgId, orgId));

    for (const m of members) {
      await db
        .update(schema.users)
        .set({ suspendedAt: new Date(), tokenVersion: sql`${schema.users.tokenVersion} + 1`, updatedAt: new Date() })
        .where(
          and(
            eq(schema.users.id, m.userId),
            isNull(schema.users.suspendedAt),
          ),
        );
    }

    await logEvent(orgId, "org_suspended", {
      actorId: ctx.userId,
      meta: { memberCount: members.length },
    });
    revalidatePath(`/admin/orgs/${orgId}`);
    return { message: `Suspended ${members.length} members` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { message: `Failed: ${msg}`, error: true };
  }
}

// ---------------------------------------------------------------------------
// Suspend / reactivate user
// ---------------------------------------------------------------------------

export async function suspendUser(
  _prev: SubFormState,
  formData: FormData,
): Promise<SubFormState> {
  const ctx = await requireSuperadmin();
  const userId = formData.get("userId") as string;
  if (!userId) return { message: "Missing user ID", error: true };

  try {
    await db
      .update(schema.users)
      .set({ suspendedAt: new Date(), tokenVersion: sql`${schema.users.tokenVersion} + 1`, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));

    await logEvent(null, "user_suspended", {
      actorId: ctx.userId,
      meta: { userId },
    });
    revalidatePath("/admin/users");
    return { message: "User suspended" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { message: `Failed: ${msg}`, error: true };
  }
}

export async function reactivateUser(
  _prev: SubFormState,
  formData: FormData,
): Promise<SubFormState> {
  const ctx = await requireSuperadmin();
  const userId = formData.get("userId") as string;
  if (!userId) return { message: "Missing user ID", error: true };

  try {
    await db
      .update(schema.users)
      .set({ suspendedAt: null, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));

    await logEvent(null, "user_reactivated", {
      actorId: ctx.userId,
      meta: { userId },
    });
    revalidatePath("/admin/users");
    return { message: "User reactivated" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return { message: `Failed: ${msg}`, error: true };
  }
}
