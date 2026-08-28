import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
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
 * POST /api/webhooks/paystack
 * Handles Paystack webhook events for subscription billing.
 *
 * Events handled:
 * - charge.success  → mark subscription active, save auth code
 * - charge.failed   → mark subscription past_due
 * - subscription.disable → mark subscription canceled
 *
 * Paystack sends events with a signature header: x-paystack-signature
 * which is the HMAC of the payload with the secret key.
 */
export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Verify the Paystack signature.
  const signature = request.headers.get("x-paystack-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const rawBody = await request.text();

  // Verify HMAC SHA512 signature using timing-safe comparison.
  const crypto = await import("node:crypto");
  const expectedSig = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event: string; data: Record<string, unknown> };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = event.event;
  const data = event.data;
  const reference = data.reference as string;
  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const orgId = metadata.orgId as string | undefined;

  if (!orgId) {
    // No org in metadata — can't process.
    return NextResponse.json({ received: true });
  }

  // Process event — return 500 on DB failures so Paystack retries.
  try {
    switch (eventType) {
      case "charge.success": {
        const customer = data.customer as Record<string, unknown>;
        const authorization = data.authorization as Record<string, unknown>;
        const amount = data.amount as number;
        const now = new Date();
        const periodEnd = addMonths(now, 1);

        const [sub] = await db
          .select()
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.orgId, orgId))
          .limit(1);

        if (sub) {
          // Extend from max(now, existingPeriodEnd) to not lose early payments.
          const baseDate = sub.currentPeriodEnd && sub.currentPeriodEnd > now
            ? sub.currentPeriodEnd
            : now;
          const extendedPeriodEnd = addMonths(baseDate, 1);

          await db
            .update(schema.subscriptions)
            .set({
              status: "active",
              paystackCustomerCode: customer?.customer_code as string,
              paystackAuthorizationCode: authorization?.authorization_code as string,
              paystackCustomerEmail: customer?.email as string,
              lastPaymentAt: now,
              lastPaymentAmount: amount,
              lastPaymentReference: reference,
              currentPeriodStart: now,
              currentPeriodEnd: extendedPeriodEnd,
              updatedAt: now,
            })
            .where(eq(schema.subscriptions.id, sub.id));
        }

        await logEvent(orgId, "subscription_updated", {
          actorId: undefined,
          meta: { action: "charge_success", reference, amount },
        });
        break;
      }

      case "charge.failed": {
        const [sub] = await db
          .select()
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.orgId, orgId))
          .limit(1);

        if (sub) {
          await db
            .update(schema.subscriptions)
            .set({
              status: "past_due",
              updatedAt: new Date(),
            })
            .where(eq(schema.subscriptions.id, sub.id));
        }

        await logEvent(orgId, "subscription_updated", {
          actorId: undefined,
          meta: { action: "charge_failed", reference },
        });
        break;
      }

      case "subscription.disable": {
        const [sub] = await db
          .select()
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.orgId, orgId))
          .limit(1);

        if (sub) {
          await db
            .update(schema.subscriptions)
            .set({
              status: "canceled",
              canceledAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(schema.subscriptions.id, sub.id));
        }

        await logEvent(orgId, "subscription_canceled", {
          actorId: undefined,
          meta: { action: "subscription_disabled", reference },
        });
        break;
      }

      default:
        // Unhandled event — acknowledge but don't process.
        break;
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
    // Return 500 so Paystack retries — the DB write may have failed.
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
