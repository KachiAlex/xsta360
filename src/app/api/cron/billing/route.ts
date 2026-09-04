import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, and, asc } from "drizzle-orm";
import { count } from "drizzle-orm";
import { chargeAuthorization, nairaToKobo, generateReference } from "@/lib/paystack";
import { sendTrialEndingEmail, sendPaymentFailedEmail, sendReceiptEmail } from "@/lib/email";
import { logEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

const GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

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

/** Get the first admin's name + email for an org — used for billing emails. */
async function getOrgAdmin(orgId: string) {
  const [admin] = await db
    .select({ email: schema.users.email, name: schema.users.name })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(and(eq(schema.memberships.orgId, orgId), eq(schema.memberships.role, "admin")))
    .orderBy(asc(schema.memberships.createdAt))
    .limit(1);
  return admin ?? null;
}

/** Current monthly amount for an org (base + per-seat). */
async function orgMonthlyAmount(orgId: string, basePrice: number, perSeat: number) {
  const [memberRow] = await db
    .select({ value: count() })
    .from(schema.memberships)
    .where(eq(schema.memberships.orgId, orgId));
  const memberCount = memberRow?.value ?? 1;
  return { memberCount, amount: basePrice + Math.max(0, memberCount - 1) * perSeat };
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
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const results: { orgId: string; status: string; amount?: number; error?: string }[] = [];

  // ---------------------------------------------------------------------
  // 1. Trial-ending reminder emails — sent at 3 days and 1 day remaining.
  //    Deduped via trialNoticeAt so we don't email twice for the same day.
  // ---------------------------------------------------------------------
  const trialingSubs = await db
    .select({
      id: schema.subscriptions.id,
      orgId: schema.subscriptions.orgId,
      planId: schema.subscriptions.planId,
      status: schema.subscriptions.status,
      authCode: schema.subscriptions.paystackAuthorizationCode,
      email: schema.subscriptions.paystackCustomerEmail,
      periodEnd: schema.subscriptions.currentPeriodEnd,
      trialEndsAt: schema.subscriptions.trialEndsAt,
      trialNoticeAt: schema.subscriptions.trialNoticeAt,
      basePrice: schema.plans.basePriceMonthly,
      perSeat: schema.plans.perSeatPriceMonthly,
      currency: schema.plans.currency,
      planName: schema.plans.name,
    })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
    .where(eq(schema.subscriptions.status, "trialing"));

  let remindersSent = 0;
  for (const sub of trialingSubs) {
    if (!sub.trialEndsAt) continue;
    const daysLeft = Math.ceil((sub.trialEndsAt.getTime() - now.getTime()) / DAY_MS);
    // Only send at exactly 3 or 1 days left, and not if we already emailed recently.
    if (daysLeft !== 3 && daysLeft !== 1) continue;
    if (sub.trialNoticeAt && now.getTime() - sub.trialNoticeAt.getTime() < DAY_MS) continue;
    if (sub.authCode) continue; // already has a card on file — no need to nudge

    const admin = await getOrgAdmin(sub.orgId);
    if (!admin) continue;

    const { amount } = await orgMonthlyAmount(sub.orgId, sub.basePrice, sub.perSeat);
    const [org] = await db
      .select({ name: schema.organizations.name })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, sub.orgId))
      .limit(1);

    try {
      await sendTrialEndingEmail({
        to: admin.email,
        userName: admin.name,
        orgName: org?.name ?? "your workspace",
        daysLeft,
        amount,
        currency: sub.currency,
        appUrl,
      });
      await db
        .update(schema.subscriptions)
        .set({ trialNoticeAt: now })
        .where(eq(schema.subscriptions.id, sub.id));
      remindersSent++;
    } catch (err) {
      console.error(`Trial reminder email failed for org ${sub.orgId}:`, err);
    }
  }

  // ---------------------------------------------------------------------
  // 2. Convert expired trials: charge if a card is on file, else past_due
  //    (trial expiry is a hard block — no grace).
  // ---------------------------------------------------------------------
  const trialsDue = trialingSubs.filter((s) => s.trialEndsAt && s.trialEndsAt <= now);

  for (const sub of trialsDue) {
    if (!sub.authCode || !sub.email) {
      await db
        .update(schema.subscriptions)
        .set({ status: "past_due", graceEndsAt: now, updatedAt: now })
        .where(eq(schema.subscriptions.id, sub.id));

      await logEvent(sub.orgId, "subscription_updated", {
        meta: { action: "trial_expired_no_payment" },
      });
      results.push({ orgId: sub.orgId, status: "trial_expired" });
      continue;
    }

    try {
      const { memberCount, amount: amountNaira } = await orgMonthlyAmount(sub.orgId, sub.basePrice, sub.perSeat);
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
        const periodEnd = addMonths(now, 1);
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
          meta: { action: "trial_converted", reference, amount: amountNaira },
        });

        const admin = await getOrgAdmin(sub.orgId);
        if (admin) {
          const [org] = await db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, sub.orgId)).limit(1);
          await sendReceiptEmail({
            to: admin.email, userName: admin.name, orgName: org?.name ?? "your workspace",
            planName: sub.planName, amount: amountNaira, currency: sub.currency,
            reference, memberCount, nextBillingDate: periodEnd, appUrl,
          }).catch((e) => console.error(`Receipt email failed for org ${sub.orgId}:`, e));
        }

        results.push({ orgId: sub.orgId, status: "trial_charged", amount: amountNaira });
      } else {
        await db
          .update(schema.subscriptions)
          .set({ status: "past_due", graceEndsAt: now, updatedAt: now })
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
        .set({ status: "past_due", graceEndsAt: now, updatedAt: now })
        .where(eq(schema.subscriptions.id, sub.id));
      results.push({ orgId: sub.orgId, status: "error", error: msg });
    }
  }

  // ---------------------------------------------------------------------
  // 3. Recurring renewals — charge active subs whose period has ended.
  //    On failure: mark past_due with a grace window and email the admin.
  // ---------------------------------------------------------------------
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
      planName: schema.plans.name,
    })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
    .where(eq(schema.subscriptions.status, "active"));

  const chargeable = dueSubs.filter(
    (s) => s.authCode && s.email && s.periodEnd && s.periodEnd <= now,
  );

  for (const sub of chargeable) {
    try {
      const { memberCount, amount: amountNaira } = await orgMonthlyAmount(sub.orgId, sub.basePrice, sub.perSeat);
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
            graceEndsAt: null,
            updatedAt: now,
          })
          .where(eq(schema.subscriptions.id, sub.id));

        await logEvent(sub.orgId, "subscription_updated", {
          meta: { action: "recurring_charge_success", reference, amount: amountNaira, members: memberCount },
        });

        const admin = await getOrgAdmin(sub.orgId);
        if (admin) {
          const [org] = await db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, sub.orgId)).limit(1);
          await sendReceiptEmail({
            to: admin.email, userName: admin.name, orgName: org?.name ?? "your workspace",
            planName: sub.planName, amount: amountNaira, currency: sub.currency,
            reference, memberCount, nextBillingDate: periodEnd, appUrl,
          }).catch((e) => console.error(`Receipt email failed for org ${sub.orgId}:`, e));
        }

        results.push({ orgId: sub.orgId, status: "charged", amount: amountNaira });
      } else {
        // Charge failed — past_due with a grace window, then dunning email.
        const graceEndsAt = new Date(now.getTime() + GRACE_DAYS * DAY_MS);
        await db
          .update(schema.subscriptions)
          .set({ status: "past_due", graceEndsAt, updatedAt: now })
          .where(eq(schema.subscriptions.id, sub.id));

        await logEvent(sub.orgId, "subscription_updated", {
          meta: { action: "recurring_charge_failed", reference, status: chargeResult.status },
        });

        const admin = await getOrgAdmin(sub.orgId);
        if (admin) {
          const [org] = await db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, sub.orgId)).limit(1);
          await sendPaymentFailedEmail({
            to: admin.email, userName: admin.name, orgName: org?.name ?? "your workspace",
            amount: amountNaira, currency: sub.currency, graceDays: GRACE_DAYS, appUrl,
          }).catch((e) => console.error(`Dunning email failed for org ${sub.orgId}:`, e));
        }

        results.push({ orgId: sub.orgId, status: "failed", error: chargeResult.gateway_response });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`Billing error for org ${sub.orgId}:`, msg);

      const graceEndsAt = new Date(now.getTime() + GRACE_DAYS * DAY_MS);
      await db
        .update(schema.subscriptions)
        .set({ status: "past_due", graceEndsAt, updatedAt: now })
        .where(eq(schema.subscriptions.id, sub.id));

      results.push({ orgId: sub.orgId, status: "error", error: msg });
    }
  }

  return NextResponse.json({
    remindersSent,
    trialsProcessed: trialsDue.length,
    processed: chargeable.length,
    results,
    timestamp: now.toISOString(),
  });
}
