"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySession, getOrgBilling } from "@/lib/dal";
import { logEvent } from "@/lib/audit";
import {
  chargeAuthorization,
  nairaToKobo,
  generateReference,
} from "@/lib/paystack";

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
  const currentMonthly = billing.monthlyAmount;
  const additionalSeats = Math.max(0, billing.memberCount - 1);
  const newMonthly = plan.basePriceMonthly + additionalSeats * plan.perSeatPriceMonthly;

  const isUpgrade = newMonthly > currentMonthly;
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
        await db
          .update(schema.subscriptions)
          .set({
            planId,
            status: "active",
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
