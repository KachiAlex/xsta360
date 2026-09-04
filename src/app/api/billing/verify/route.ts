import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { verifySession, getOrgBilling } from "@/lib/dal";
import { verifyTransaction } from "@/lib/paystack";
import { sendReceiptEmail } from "@/lib/email";
import { logEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Safely add months to a date, handling month-end rollover. */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) {
    d.setDate(0);
  }
  return d;
}

/**
 * POST /api/billing/verify
 * Verifies a Paystack transaction and saves the authorization code
 * for recurring billing. Activates the subscription.
 *
 * Body: { reference: string }
 */
export async function POST(request: Request) {
  try {
    const ctx = await verifySession();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (ctx.role !== "admin") {
      return NextResponse.json({ error: "Only workspace admins can manage billing" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const reference = typeof body.reference === "string" ? body.reference : null;

    if (!reference) {
      return NextResponse.json({ error: "Missing transaction reference" }, { status: 400 });
    }

    const txn = await verifyTransaction(reference);

    if (txn.status !== "success") {
      await logEvent(ctx.orgId, "subscription_updated", {
        actorId: ctx.userId,
        meta: { action: "payment_failed", reference, status: txn.status },
      });
      return NextResponse.json({ error: `Payment ${txn.status}`, status: txn.status }, { status: 400 });
    }

    // Verify the org matches the metadata — reject if missing or mismatched.
    const txnOrgId = (txn.metadata as Record<string, unknown>)?.orgId as string | undefined;
    if (!txnOrgId || txnOrgId !== ctx.orgId) {
      return NextResponse.json({ error: "Transaction does not belong to this organization" }, { status: 403 });
    }

    // Check if this is a plan-upgrade checkout.
    const txnPlanId = (txn.metadata as Record<string, unknown>)?.planId as string | undefined;
    const isPlanUpgrade = (txn.metadata as Record<string, unknown>)?.isPlanUpgrade === true;

    const billing = await getOrgBilling(ctx.orgId);

    // Save authorization code + customer code for recurring billing.
    const now = new Date();

    const [existingSub] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.orgId, ctx.orgId))
      .limit(1);

    if (existingSub) {
      // Extend from max(now, existingPeriodEnd) to not lose early payments.
      const baseDate = existingSub.currentPeriodEnd && existingSub.currentPeriodEnd > now
        ? existingSub.currentPeriodEnd
        : now;
      const periodEnd = addMonths(baseDate, 1);

      await db
        .update(schema.subscriptions)
        .set({
          status: "active",
          // Apply plan change if this was an upgrade checkout.
          ...(isPlanUpgrade && txnPlanId ? { planId: txnPlanId } : {}),
          paystackCustomerCode: txn.customer.customer_code,
          paystackAuthorizationCode: txn.authorization?.authorization_code ?? null,
          paystackCustomerEmail: txn.customer.email,
          lastPaymentAt: now,
          lastPaymentAmount: txn.amount, // in kobo
          lastPaymentReference: reference,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          updatedAt: now,
        })
        .where(eq(schema.subscriptions.id, existingSub.id));
    } else {
      // Create subscription if none exists.
      const periodEnd = addMonths(now, 1);
      const planId = billing.plan.planId !== "none"
        ? billing.plan.planId
        : (await db.select().from(schema.plans).limit(1))[0]?.id;

      if (!planId) {
        return NextResponse.json({ error: "No plan configured" }, { status: 500 });
      }

      await db.insert(schema.subscriptions).values({
        orgId: ctx.orgId,
        planId,
        status: "active",
        paystackCustomerCode: txn.customer.customer_code,
        paystackAuthorizationCode: txn.authorization?.authorization_code ?? null,
        paystackCustomerEmail: txn.customer.email,
        lastPaymentAt: now,
        lastPaymentAmount: txn.amount,
        lastPaymentReference: reference,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      });
    }

    await logEvent(ctx.orgId, "subscription_updated", {
      actorId: ctx.userId,
      meta: {
        action: "payment_verified",
        reference,
        amount: txn.amount,
        authorizationCode: txn.authorization?.authorization_code,
      },
    });

    // Revalidate all app pages so the new plan/status reflects immediately.
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

    // Fetch the updated plan name for the receipt email (may have changed
    // if this was a plan-upgrade checkout).
    const updatedBilling = await getOrgBilling(ctx.orgId);
    const [payer] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, ctx.userId))
      .limit(1);
    const [org] = await db
      .select({ name: schema.organizations.name })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, ctx.orgId))
      .limit(1);
    const [subNow] = await db
      .select({ currentPeriodEnd: schema.subscriptions.currentPeriodEnd })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.orgId, ctx.orgId))
      .limit(1);

    if (payer) {
      await sendReceiptEmail({
        to: payer.email,
        userName: payer.name,
        orgName: org?.name ?? "your workspace",
        planName: updatedBilling.plan.planName,
        amount: txn.amount / 100, // kobo → naira
        currency: updatedBilling.plan.currency,
        reference,
        memberCount: billing.memberCount,
        nextBillingDate: subNow?.currentPeriodEnd ?? now,
        appUrl: process.env.APP_URL ?? "http://localhost:3000",
      }).catch((e) => console.error("Receipt email failed:", e));
    }

    return NextResponse.json({
      success: true,
      status: txn.status,
      amount: txn.amount,
      customer_code: txn.customer.customer_code,
    });
  } catch (err) {
    console.error("Payment verify error:", err);
    return NextResponse.json({ error: "Failed to verify payment" }, { status: 500 });
  }
}
