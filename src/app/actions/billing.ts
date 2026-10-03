"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySession, getOrgBilling, getPlanMaxMembers } from "@/lib/dal";
import { validatePromoCode, applyPromoToOrg } from "@/lib/promo";
import { logEvent } from "@/lib/audit";
import {
  chargeAuthorization,
  nairaToKobo,
  generateReference,
} from "@/lib/paystack";

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

/** Revalidate all app pages so plan/status changes reflect immediately. */
function revalidateAppPaths() {
  revalidatePath("/billing");
  revalidatePath("/dashboard");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/reports");
  revalidatePath("/settings");
  revalidatePath("/team");
  revalidatePath("/tasks");
  revalidatePath("/sequences");
  revalidatePath("/follow-ups");
  revalidatePath("/contact-card");
  revalidatePath("/", "layout");
}

export type BillingFormState = {
  message?: string;
  error?: boolean;
  /** When set, the client should redirect to this Paystack checkout URL. */
  checkoutUrl?: string;
  /** When set, the client should redirect to this URL (e.g. billing page). */
  redirectUrl?: string;
};

/**
 * Switch the org's subscription to a different plan.
 * Admin only.
 *
 * - **Upgrade** (new plan is more expensive): charges immediately.
 *   - If the org has a saved card → charge via Paystack, then switch.
 *   - If no saved card → return a checkout URL for the user to pay.
 * - **Downgrade** (new plan is cheaper or same): switch takes effect
 *   immediately; the new lower amount applies at the next billing date.
 */
export async function changePlan(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in", error: true };
  if (ctx.role !== "admin") return { message: "Only admins can change the plan", error: true };

  const planId = String(formData.get("planId") ?? "");
  if (!z.string().uuid().safeParse(planId).success) {
    return { message: "Invalid plan", error: true };
  }

  const [plan] = await db
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.id, planId), eq(schema.plans.active, true)))
    .limit(1);
  if (!plan) return { message: "Plan not found", error: true };

  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.orgId, ctx.orgId))
    .limit(1);

  if (!sub) {
    return { message: "No subscription found", error: true };
  }
  if (sub.planId === planId) {
    return { message: `Already on the ${plan.name} plan` };
  }

  // Compute current and new monthly amounts.
  const billing = await getOrgBilling(ctx.orgId);
  const maxMembers = getPlanMaxMembers({ ...billing.plan, planId: plan.id, planName: plan.name, features: plan.features as Record<string, unknown> });
  if (maxMembers !== null && billing.memberCount > maxMembers) {
    return { message: `This plan supports at most ${maxMembers} members. Remove ${billing.memberCount - maxMembers} member(s) first or choose a higher plan.`, error: true };
  }
  const currentMonthly = billing.monthlyAmount;
  const additionalSeats = Math.max(0, billing.memberCount - 1);
  const isLifetimeTarget = plan.billingInterval === "lifetime";
  // Lifetime plans bill a single fixed amount — no per-seat math.
  const newMonthly = isLifetimeTarget
    ? plan.basePriceMonthly
    : plan.basePriceMonthly + additionalSeats * plan.perSeatPriceMonthly;

  // Switching to a lifetime plan always requires the one-time payment.
  const isUpgrade = isLifetimeTarget || newMonthly > currentMonthly;
  const hasSavedCard = !!sub.paystackAuthorizationCode;

  // ── Downgrade or same price: switch immediately, takes effect next cycle ──
  if (!isUpgrade) {
    await db
      .update(schema.subscriptions)
      .set({ planId, updatedAt: new Date() })
      .where(eq(schema.subscriptions.id, sub.id));

    await logEvent(ctx.orgId, "subscription_updated", {
      actorId: ctx.userId,
      meta: {
        action: "plan_changed",
        from: sub.planId,
        to: planId,
        planName: plan.name,
        type: "downgrade",
        newMonthly,
      },
    });

    revalidateAppPaths();
    return {
      message: `Switched to the ${plan.name} plan. The new rate of ₦${newMonthly.toLocaleString()}/mo applies at your next billing date.`,
    };
  }

  // ── Upgrade: need to charge ──

  // If the org has a saved card, charge it immediately.
  if (hasSavedCard && sub.paystackCustomerEmail) {
    const reference = generateReference("xsta_upgrade");
    try {
      const charge = await chargeAuthorization({
        authorizationCode: sub.paystackAuthorizationCode!,
        email: sub.paystackCustomerEmail,
        amount: nairaToKobo(newMonthly),
        reference,
        metadata: {
          orgId: ctx.orgId,
          planId,
          type: "plan_upgrade",
          planName: plan.name,
        },
      });

      if (charge.status === "success") {
        // Charge succeeded — switch the plan now.
        const now = new Date();
        const baseDate = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
        await db
          .update(schema.subscriptions)
          .set({
            planId,
            status: "active",
            currentPeriodStart: now,
            // Lifetime plans never expire — null period end = no renewal charges.
            currentPeriodEnd: isLifetimeTarget ? null : addMonths(baseDate, 1),
            lastPaymentAt: now,
            lastPaymentAmount: nairaToKobo(newMonthly),
            lastPaymentReference: reference,
            updatedAt: now,
          })
          .where(eq(schema.subscriptions.id, sub.id));

        await logEvent(ctx.orgId, "subscription_updated", {
          actorId: ctx.userId,
          meta: {
            action: "plan_changed",
            from: sub.planId,
            to: planId,
            planName: plan.name,
            type: "upgrade",
            newMonthly,
            reference,
          },
        });

        revalidateAppPaths();
        return {
          message: `Upgraded to the ${plan.name} plan. ₦${newMonthly.toLocaleString()} charged successfully.`,
        };
      } else {
        return {
          message: `Payment ${charge.status}. Please try again or update your payment method.`,
          error: true,
        };
      }
    } catch (err) {
      console.error("Upgrade charge failed:", err);
      return {
        message: "Failed to charge your saved card. Please add a payment method below and try again.",
        error: true,
      };
    }
  }

  // No saved card — redirect to Paystack checkout.
  // We'll pass the new planId in the metadata so /api/billing/verify
  // can apply the plan change after successful payment.
  // The client will call /api/billing/init with { planId } to get the URL.
  revalidateAppPaths();
  return {
    message: `Upgrading to ${plan.name} requires payment. Redirecting to checkout...`,
    redirectUrl: `/billing?upgrade=${planId}`,
  };
}

// ---------------------------------------------------------------------------
// Promo codes — redeem a superadmin-issued code for a free period on a plan.
// verifySession (not verifyActiveSession) so a blocked org can redeem its way
// back in — that's the point of a promo.
// ---------------------------------------------------------------------------

export async function redeemPromoCode(
  _prev: BillingFormState,
  formData: FormData,
): Promise<BillingFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in", error: true };
  if (ctx.role !== "admin") return { message: "Only admins can redeem promo codes", error: true };

  const check = await validatePromoCode(String(formData.get("promoCode") ?? ""));
  if (!check.ok) return { message: check.error, error: true };

  const result = await db.transaction((tx) => applyPromoToOrg(tx, ctx.orgId, check.promo));
  if (!result.ok) return { message: result.error, error: true };

  await logEvent(ctx.orgId, "subscription_updated", {
    actorId: ctx.userId,
    meta: {
      action: "promo_redeemed",
      code: check.promo.code,
      planId: check.promo.planId,
      freeDays: check.promo.freeDays,
    },
  });

  revalidateAppPaths();
  return { message: `Promo ${check.promo.code} applied — ${check.promo.freeDays} days free.` };
}
