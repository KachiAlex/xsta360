import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/dal";
import { getOrgBilling } from "@/lib/dal";
import { verifyTransaction } from "@/lib/paystack";
import { logEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/verify
 * Verifies a Paystack transaction and saves the authorization code
 * for recurring billing. Activates the subscription.
 *
 * Body: { reference: string }
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    if (ctx.role !== "admin") {
      return NextResponse.json({ error: "Only workspace admins can manage billing" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const reference = body.reference;

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

    // Verify the org matches the metadata.
    const txnOrgId = (txn.metadata as Record<string, unknown>)?.orgId as string | undefined;
    if (txnOrgId && txnOrgId !== ctx.orgId) {
      return NextResponse.json({ error: "Transaction does not belong to this organization" }, { status: 403 });
    }

    const billing = await getOrgBilling(ctx.orgId);

    // Save authorization code + customer code for recurring billing.
    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const [existingSub] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.orgId, ctx.orgId))
      .limit(1);

    if (existingSub) {
      await db
        .update(schema.subscriptions)
        .set({
          status: "active",
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
      await db.insert(schema.subscriptions).values({
        orgId: ctx.orgId,
        planId: billing.plan.planId !== "none" ? billing.plan.planId : (await db.select().from(schema.plans).limit(1))[0]?.id,
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

    return NextResponse.json({
      success: true,
      status: txn.status,
      amount: txn.amount,
      customer_code: txn.customer.customer_code,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Payment verify error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
