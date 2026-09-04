import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { count } from "drizzle-orm";
import { chargeAuthorization, nairaToKobo, generateReference } from "@/lib/paystack";
import { logEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

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

/**
 * GET /api/cron/billing
 * Runs monthly (via external cron) to charge active subscriptions
 * whose current_period_end has passed.
 *
 * Auth: shared secret header (CRON_SECRET).
 *
 * For each subscription that:
 * 1. Has a saved Paystack authorization code
 * 2. Is active or past_due
 * 3. Has current_period_end <= now
 *
 * We charge the computed monthly amount (base + per-seat) via Paystack.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const expected = `Bearer ${cronSecret}`;
  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results: { orgId: string; status: string; amount?: number; error?: string }[] = [];

  // First: convert expired trials. A trialing sub past trialEndsAt with a
  // saved card gets its first charge; without one it becomes past_due.
  const expiredTrials = await db
    .select({
      id: schema.subscriptions.id,
      orgId: schema.subscriptions.orgId,
      planId: schema.subscriptions.planId,
      status: schema.subscriptions.status,
      authCode: schema.subscriptions.paystackAuthorizationCode,
      email: schema.subscriptions.paystackCustomerEmail,
      periodEnd: schema.subscriptions.currentPeriodEnd,
      trialEndsAt: schema.subscriptions.trialEndsAt,
      basePrice: schema.plans.basePriceMonthly,
      perSeat: schema.plans.perSeatPriceMonthly,
      currency: schema.plans.currency,
    })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
    .where(eq(schema.subscriptions.status, "trialing"));

  const trialsDue = expiredTrials.filter((s) => s.trialEndsAt && s.trialEndsAt <= now);

  for (const sub of trialsDue) {
    if (!sub.authCode || !sub.email) {
      // No card on file — trial ends, subscription goes past_due.
      await db
        .update(schema.subscriptions)
        .set({ status: "past_due", updatedAt: now })
        .where(eq(schema.subscriptions.id, sub.id));

      await logEvent(sub.orgId, "subscription_updated", {
        meta: { action: "trial_expired_no_payment" },
      });
      results.push({ orgId: sub.orgId, status: "trial_expired" });
      continue;
    }

    // Card on file — charge for the first paid period.
    try {
      const [memberRow] = await db
        .select({ value: count() })
        .from(schema.memberships)
        .where(eq(schema.memberships.orgId, sub.orgId));
      const memberCount = memberRow?.value ?? 1;
      const amountNaira = sub.basePrice + Math.max(0, memberCount - 1) * sub.perSeat;

      const reference = generateReference("xsta_trial");
      const chargeResult = await chargeAuthorization({
        authorizationCode: sub.authCode,
        email: sub.email,
        amount: nairaToKobo(amountNaira),
        reference,
        metadata: {
          orgId: sub.orgId,
          planId: sub.planId,
          memberCount,
          billingType: "trial_conversion",
        },
      });

      if (chargeResult.status === "success") {
        await db
          .update(schema.subscriptions)
          .set({
            status: "active",
            lastPaymentAt: now,
            lastPaymentAmount: chargeResult.amount,
            lastPaymentReference: reference,
            currentPeriodStart: now,
            currentPeriodEnd: addMonths(now, 1),
            updatedAt: now,
          })
          .where(eq(schema.subscriptions.id, sub.id));

        await logEvent(sub.orgId, "subscription_updated", {
          meta: { action: "trial_converted", reference, amount: amountNaira },
        });
        results.push({ orgId: sub.orgId, status: "trial_charged", amount: amountNaira });
      } else {
        await db
          .update(schema.subscriptions)
          .set({ status: "past_due", updatedAt: now })
          .where(eq(schema.subscriptions.id, sub.id));

        await logEvent(sub.orgId, "subscription_updated", {
          meta: { action: "trial_charge_failed", reference, status: chargeResult.status },
        });
        results.push({ orgId: sub.orgId, status: "failed", error: chargeResult.gateway_response });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`Trial conversion error for org ${sub.orgId}:`, msg);
      await db
        .update(schema.subscriptions)
        .set({ status: "past_due", updatedAt: now })
        .where(eq(schema.subscriptions.id, sub.id));
      results.push({ orgId: sub.orgId, status: "error", error: msg });
    }
  }

  // Find subscriptions due for renewal.
  const dueSubs = await db
    .select({
      id: schema.subscriptions.id,
      orgId: schema.subscriptions.orgId,
      planId: schema.subscriptions.planId,
      status: schema.subscriptions.status,
      authCode: schema.subscriptions.paystackAuthorizationCode,
      email: schema.subscriptions.paystackCustomerEmail,
      periodEnd: schema.subscriptions.currentPeriodEnd,
      basePrice: schema.plans.basePriceMonthly,
      perSeat: schema.plans.perSeatPriceMonthly,
      currency: schema.plans.currency,
    })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
    .where(
      and(
        eq(schema.subscriptions.status, "active"),
        // Has auth code for recurring charge
        // (drizzle doesn't have isNotNull in this import, so we filter in JS)
      ),
    );

  // Filter in JS: has auth code + period end has passed.
  const chargeable = dueSubs.filter(
    (s) => s.authCode && s.email && s.periodEnd && s.periodEnd <= now,
  );

  for (const sub of chargeable) {
    try {
      // Get current member count for this org.
      const [memberRow] = await db
        .select({ value: count() })
        .from(schema.memberships)
        .where(eq(schema.memberships.orgId, sub.orgId));

      const memberCount = memberRow?.value ?? 1;
      const additionalSeats = Math.max(0, memberCount - 1);
      const amountNaira = sub.basePrice + additionalSeats * sub.perSeat;

      const reference = generateReference("xsta_renew");
      const chargeResult = await chargeAuthorization({
        authorizationCode: sub.authCode!,
        email: sub.email!,
        amount: nairaToKobo(amountNaira),
        reference,
        metadata: {
          orgId: sub.orgId,
          planId: sub.planId,
          memberCount,
          billingType: "recurring",
        },
      });

      if (chargeResult.status === "success") {
        const periodEnd = addMonths(new Date(), 1);

        await db
          .update(schema.subscriptions)
          .set({
            status: "active",
            lastPaymentAt: now,
            lastPaymentAmount: chargeResult.amount,
            lastPaymentReference: reference,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            updatedAt: now,
          })
          .where(eq(schema.subscriptions.id, sub.id));

        await logEvent(sub.orgId, "subscription_updated", {
          actorId: undefined,
          meta: { action: "recurring_charge_success", reference, amount: amountNaira, members: memberCount },
        });

        results.push({ orgId: sub.orgId, status: "charged", amount: amountNaira });
      } else {
        // Charge failed — mark past_due.
        await db
          .update(schema.subscriptions)
          .set({ status: "past_due", updatedAt: now })
          .where(eq(schema.subscriptions.id, sub.id));

        await logEvent(sub.orgId, "subscription_updated", {
          actorId: undefined,
          meta: { action: "recurring_charge_failed", reference, status: chargeResult.status },
        });

        results.push({ orgId: sub.orgId, status: "failed", error: chargeResult.gateway_response });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`Billing error for org ${sub.orgId}:`, msg);

      await db
        .update(schema.subscriptions)
        .set({ status: "past_due", updatedAt: now })
        .where(eq(schema.subscriptions.id, sub.id));

      results.push({ orgId: sub.orgId, status: "error", error: msg });
    }
  }

  return NextResponse.json({
    trialsProcessed: trialsDue.length,
    processed: chargeable.length,
    results,
    timestamp: now.toISOString(),
  });
}
