import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/dal";
import { getOrgBilling } from "@/lib/dal";
import { initializeTransaction, nairaToKobo, generateReference } from "@/lib/paystack";
import { logEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/init
 * Initializes a Paystack transaction for the workspace's monthly bill.
 * Called by the billing page when the workspace admin clicks "Pay now".
 *
 * Body: { amount?: number }  // optional override; defaults to computed monthly
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireAuth();

    // Only workspace admins can initiate payments.
    if (ctx.role !== "admin") {
      return NextResponse.json({ error: "Only workspace admins can manage billing" }, { status: 403 });
    }

    const billing = await getOrgBilling(ctx.orgId);

    // Get the admin's email for Paystack customer.
    const [user] = await db
      .select({ email: schema.users.email, name: schema.users.name })
      .from(schema.users)
      .where(eq(schema.users.id, ctx.userId))
      .limit(1);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const amountNaira = body.amount ?? billing.monthlyAmount;

    if (amountNaira <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
    }

    const reference = generateReference("xsta_sub");
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";

    const result = await initializeTransaction({
      email: user.email,
      amount: nairaToKobo(amountNaira),
      reference,
      callback_url: `${appUrl}/billing?reference=${reference}`,
      metadata: {
        orgId: ctx.orgId,
        planId: billing.plan.planId,
        memberCount: billing.memberCount,
        custom_fields: [
          { display_name: "Organization", variable_name: "organization", value: ctx.orgId },
          { display_name: "Plan", variable_name: "plan", value: billing.plan.planName },
          { display_name: "Members", variable_name: "members", value: String(billing.memberCount) },
        ],
      },
    });

    await logEvent(ctx.orgId, "subscription_updated", {
      actorId: ctx.userId,
      meta: { action: "payment_initiated", reference, amount: amountNaira },
    });

    return NextResponse.json({
      authorization_url: result.authorization_url,
      reference: result.reference,
      access_code: result.access_code,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Payment init error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
