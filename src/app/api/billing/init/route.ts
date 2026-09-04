import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, and } from "drizzle-orm";
import { verifySession } from "@/lib/dal";
import { getOrgBilling } from "@/lib/dal";
import { initializeTransaction, nairaToKobo, generateReference } from "@/lib/paystack";
import { logEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/init
 * Initializes a Paystack transaction for the workspace's monthly bill.
 * Called by the billing page when the workspace admin clicks "Pay now".
 *
 * Body: { amount?: number, planId?: string }
 *   - amount: optional override; defaults to computed monthly
 *   - planId: when set, this is a plan-upgrade checkout — compute the new
 *     plan's monthly amount and pass planId in metadata so /api/billing/verify
 *     can apply the plan change after payment.
 */
export async function POST(request: Request) {
  try {
    const ctx = await verifySession();
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // If planId is provided, this is a plan upgrade — compute the new amount.
    let amountNaira = billing.monthlyAmount;
    let targetPlanId = billing.plan.planId;
    let targetPlanName = billing.plan.planName;

    if (typeof body.planId === "string" && body.planId.length > 0) {
      const [newPlan] = await db
        .select()
        .from(schema.plans)
        .where(and(eq(schema.plans.id, body.planId), eq(schema.plans.active, true)))
        .limit(1);

      if (!newPlan) {
        return NextResponse.json({ error: "Target plan not found" }, { status: 404 });
      }

      targetPlanId = newPlan.id;
      targetPlanName = newPlan.name;
      const additionalSeats = Math.max(0, billing.memberCount - 1);
      amountNaira = newPlan.basePriceMonthly + additionalSeats * newPlan.perSeatPriceMonthly;
    } else if (typeof body.amount === "number" && body.amount > 0) {
      amountNaira = body.amount;
    }

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
        planId: targetPlanId,
        memberCount: billing.memberCount,
        isPlanUpgrade: typeof body.planId === "string",
        custom_fields: [
          { display_name: "Organization", variable_name: "organization", value: ctx.orgId },
          { display_name: "Plan", variable_name: "plan", value: targetPlanName },
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
    console.error("Payment init error:", err);
    return NextResponse.json({ error: "Failed to initialize payment" }, { status: 500 });
  }
}
