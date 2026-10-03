"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, and, isNotNull, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireSuperadmin } from "@/lib/dal";
import { logEvent } from "@/lib/audit";

export type SubFormState = { message?: string; error?: boolean };

/** Safely add months to a date, handling month-end rollover. */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // If the day rolled over (e.g. Jan 31 + 1 = Mar 3), clamp to last day of target month.
  if (d.getDate() < day) {
    d.setDate(0); // Last day of previous month
  }
  return d;
}

// ---------------------------------------------------------------------------
// Plans CRUD
// ---------------------------------------------------------------------------

const PlanSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").trim(),
  billingInterval: z.enum(["monthly", "lifetime"]).default("monthly"),
  basePriceMonthly: z.coerce.number().int().min(0),
  perSeatPriceMonthly: z.coerce.number().int().min(0).default(0),
  trialDays: z.coerce.number().int().min(0).default(0),
  currency: z.string().min(1).max(3).default("₦"),
  features: z.string().nullish(),
  position: z.coerce.number().int().min(0).default(0),
});

export async function createPlan(
  _prev: SubFormState,
  formData: FormData,
): Promise<SubFormState> {
  const ctx = await requireSuperadmin();
  const parsed = PlanSchema.safeParse({
    name: formData.get("name"),
    billingInterval: formData.get("billingInterval") ?? "monthly",
    basePriceMonthly: formData.get("basePriceMonthly"),
    perSeatPriceMonthly: formData.get("perSeatPriceMonthly") ?? 0,
    trialDays: formData.get("trialDays") ?? 0,
    currency: formData.get("currency") ?? "₦",
    features: formData.get("features"),
    position: formData.get("position") ?? 0,
  });
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Invalid input", error: true };
  }

  // Lifetime plans bill a single fixed amount — per-seat and trial don't apply.
  const isLifetime = parsed.data.billingInterval === "lifetime";

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
        billingInterval: parsed.data.billingInterval,
        basePriceMonthly: parsed.data.basePriceMonthly,
        perSeatPriceMonthly: isLifetime ? 0 : parsed.data.perSeatPriceMonthly,
        trialDays: isLifetime ? 0 : parsed.data.trialDays,
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
    billingInterval: formData.get("billingInterval") ?? "monthly",
    basePriceMonthly: formData.get("basePriceMonthly"),
    perSeatPriceMonthly: formData.get("perSeatPriceMonthly") ?? 0,
    trialDays: formData.get("trialDays") ?? 0,
    currency: formData.get("currency") ?? "₦",
    features: formData.get("features"),
    position: formData.get("position") ?? 0,
  });
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Invalid input", error: true };
  }

  // Lifetime plans bill a single fixed amount — per-seat and trial don't apply.
  const isLifetime = parsed.data.billingInterval === "lifetime";

  let features: Record<string, unknown> | undefined = undefined;
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
        billingInterval: parsed.data.billingInterval,
        basePriceMonthly: parsed.data.basePriceMonthly,
        perSeatPriceMonthly: isLifetime ? 0 : parsed.data.perSeatPriceMonthly,
        trialDays: isLifetime ? 0 : parsed.data.trialDays,
        currency: parsed.data.currency,
        position: parsed.data.position,
        ...(features !== undefined ? { features } : {}),
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
  const statusResult = z.enum(["trialing", "active", "past_due", "canceled"]).safeParse(formData.get("status"));
  if (!statusResult.success) return { message: "Invalid status", error: true };
  const status = statusResult.data;

  if (!orgId) return { message: "Missing org ID", error: true };

  try {
    if (!planId) {
      // No plan selected — remove subscription if it exists.
      if (subId) {
        await db.delete(schema.subscriptions).where(and(eq(schema.subscriptions.id, subId), eq(schema.subscriptions.orgId, orgId)));
        await logEvent(null, "subscription_canceled", {
          actorId: ctx.userId,
          meta: { orgId },
        });
      }
      revalidatePath(`/admin/orgs/${orgId}`);
      return { message: "Subscription removed — org is now on Free" };
    }

    // Normalize fields for the target plan + status. Activating a sub ends
    // the trial and clears any grace window; lifetime plans never renew so
    // they carry no billing period.
    const [targetPlan] = await db
      .select({ billingInterval: schema.plans.billingInterval })
      .from(schema.plans)
      .where(eq(schema.plans.id, planId))
      .limit(1);
    const isLifetime = targetPlan?.billingInterval === "lifetime";

    const [currentSub] = await db
      .select({ id: schema.subscriptions.id, currentPeriodEnd: schema.subscriptions.currentPeriodEnd })
      .from(schema.subscriptions)
      .where(
        subId
          ? and(eq(schema.subscriptions.id, subId), eq(schema.subscriptions.orgId, orgId))
          : eq(schema.subscriptions.orgId, orgId),
      )
      .limit(1);

    const updateSet = {
      planId,
      status,
      // Activating a sub ends the trial and clears failed-payment grace.
      trialEndsAt: status === "trialing" ? undefined : null,
      graceEndsAt: status === "active" ? null : undefined,
      // Lifetime never renews; a monthly sub that has no period yet gets 30d.
      currentPeriodEnd: isLifetime
        ? null
        : status === "active" && !currentSub?.currentPeriodEnd
          ? addMonths(new Date(), 1)
          : undefined,
      canceledAt: status === "canceled" ? new Date() : status === "active" ? null : undefined,
      updatedAt: new Date(),
    };

    if (subId) {
      // Update existing subscription.
      await db
        .update(schema.subscriptions)
        .set(updateSet)
        .where(and(eq(schema.subscriptions.id, subId), eq(schema.subscriptions.orgId, orgId)));
      await logEvent(null, "subscription_updated", {
        actorId: ctx.userId,
        meta: { orgId, planId, status },
      });
    } else {
      // Check if a subscription already exists for this org.
      const [existing] = await db
        .select({ id: schema.subscriptions.id })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.orgId, orgId))
        .limit(1);
      if (existing) {
        await db
          .update(schema.subscriptions)
          .set(updateSet)
          .where(and(eq(schema.subscriptions.id, existing.id), eq(schema.subscriptions.orgId, orgId)));
        await logEvent(null, "subscription_updated", {
          actorId: ctx.userId,
          meta: { orgId, planId, status },
        });
      } else {
        const [plan] = await db
          .select({ trialDays: schema.plans.trialDays, billingInterval: schema.plans.billingInterval })
          .from(schema.plans)
          .where(eq(schema.plans.id, planId))
          .limit(1);
        const trialDays = plan?.trialDays ?? 14;
        const isLifetime = plan?.billingInterval === "lifetime";
        await db.insert(schema.subscriptions).values({
          orgId,
          planId,
          status,
          trialEndsAt: status === "trialing" ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000) : null,
          currentPeriodStart: status === "active" ? new Date() : null,
          // Lifetime plans never expire — null period end means no renewal charge.
          currentPeriodEnd: status === "active" && !isLifetime
            ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            : null,
        });
        await logEvent(null, "subscription_created", {
          actorId: ctx.userId,
          meta: { orgId, planId, status },
        });
      }
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

    const [updated] = await db
      .update(schema.subscriptions)
      .set({ trialEndsAt: newEnd, currentPeriodEnd: newEnd, updatedAt: new Date() })
      .where(and(eq(schema.subscriptions.id, subId), eq(schema.subscriptions.orgId, orgId)))
      .returning();
    if (!updated) return { message: "Subscription not found", error: true };

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
    const [sub] = await db
      .select({ billingInterval: schema.plans.billingInterval })
      .from(schema.subscriptions)
      .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
      .where(and(eq(schema.subscriptions.id, subId), eq(schema.subscriptions.orgId, orgId)))
      .limit(1);
    if (!sub) return { message: "Subscription not found", error: true };
    // Lifetime plans don't renew — no billing period end.
    const periodEnd = sub.billingInterval === "lifetime" ? null : addMonths(now, 1);

    const [updated] = await db
      .update(schema.subscriptions)
      .set({
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        lastPaymentAt: now,
        graceEndsAt: null,
        updatedAt: now,
      })
      .where(and(eq(schema.subscriptions.id, subId), eq(schema.subscriptions.orgId, orgId)))
      .returning();
    if (!updated) return { message: "Subscription not found", error: true };

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

  if (userId === ctx.userId) {
    return { message: "You cannot suspend your own account", error: true };
  }

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

// ---------------------------------------------------------------------------
// Promo codes — grant a free period on a plan (e.g. "LAUNCH90" → 90 days).
// ---------------------------------------------------------------------------

const PromoCodeSchema = z.object({
  code: z
    .string()
    .min(3, "Code must be at least 3 characters")
    .max(32)
    .regex(/^[A-Z0-9_-]+$/i, "Letters, numbers, dashes and underscores only"),
  planId: z.string().uuid("Pick a plan"),
  freeDays: z.coerce.number().int().min(1).max(3650),
  maxRedemptions: z.coerce.number().int().min(1).nullish().or(z.literal("").transform(() => null)),
  expiresAt: z.string().nullish(),
});

export async function createPromoCode(
  _prev: SubFormState,
  formData: FormData,
): Promise<SubFormState> {
  const ctx = await requireSuperadmin();
  const parsed = PromoCodeSchema.safeParse({
    code: formData.get("code"),
    planId: formData.get("planId"),
    freeDays: formData.get("freeDays"),
    maxRedemptions: formData.get("maxRedemptions") || null,
    expiresAt: formData.get("expiresAt") || null,
  });
  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Invalid input", error: true };
  }

  const code = parsed.data.code.trim().toUpperCase();
  const expiresAt = parsed.data.expiresAt ? new Date(`${parsed.data.expiresAt}T23:59:59Z`) : null;

  try {
    const [promo] = await db
      .insert(schema.promoCodes)
      .values({
        code,
        planId: parsed.data.planId,
        freeDays: parsed.data.freeDays,
        maxRedemptions: parsed.data.maxRedemptions ?? null,
        expiresAt,
      })
      .returning();

    await logEvent(null, "promo_code_created", {
      actorId: ctx.userId,
      meta: { promoCodeId: promo.id, code, freeDays: promo.freeDays },
    });
    revalidatePath("/admin/plans");
    return { message: `Promo code "${code}" created — ${promo.freeDays} days free per redemption` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return { message: `Code "${code}" already exists`, error: true };
    }
    return { message: `Failed: ${msg}`, error: true };
  }
}

export async function togglePromoCode(
  _prev: SubFormState,
  formData: FormData,
): Promise<SubFormState> {
  await requireSuperadmin();
  const promoId = String(formData.get("promoId") ?? "");
  if (!z.string().uuid().safeParse(promoId).success) return { message: "Invalid ID", error: true };

  const [promo] = await db
    .select({ id: schema.promoCodes.id, active: schema.promoCodes.active, code: schema.promoCodes.code })
    .from(schema.promoCodes)
    .where(eq(schema.promoCodes.id, promoId))
    .limit(1);
  if (!promo) return { message: "Promo code not found", error: true };

  await db
    .update(schema.promoCodes)
    .set({ active: !promo.active })
    .where(eq(schema.promoCodes.id, promo.id));

  revalidatePath("/admin/plans");
  return { message: `"${promo.code}" ${promo.active ? "deactivated" : "reactivated"}` };
}

export async function deletePromoCode(
  _prev: SubFormState,
  formData: FormData,
): Promise<SubFormState> {
  await requireSuperadmin();
  const promoId = String(formData.get("promoId") ?? "");
  if (!z.string().uuid().safeParse(promoId).success) return { message: "Invalid ID", error: true };

  const [promo] = await db
    .select({ id: schema.promoCodes.id, code: schema.promoCodes.code, redeemedCount: schema.promoCodes.redeemedCount })
    .from(schema.promoCodes)
    .where(eq(schema.promoCodes.id, promoId))
    .limit(1);
  if (!promo) return { message: "Promo code not found", error: true };
  if (promo.redeemedCount > 0) {
    return { message: `"${promo.code}" has been redeemed ${promo.redeemedCount}× — deactivate it instead`, error: true };
  }

  await db.delete(schema.promoCodes).where(eq(schema.promoCodes.id, promo.id));
  revalidatePath("/admin/plans");
  return { message: `"${promo.code}" deleted` };
}
