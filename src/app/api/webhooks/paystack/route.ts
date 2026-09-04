import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { logEvent } from "@/lib/audit";
import { sendReceiptEmail, sendPaymentFailedEmail } from "@/lib/email";
import { getOrgBilling } from "@/lib/dal";
import { broadcastToOrg } from "@/lib/notifications";

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

/** Get the first admin user for an org — used for sending emails. */
async function getOrgAdmin(orgId: string) {
  const [admin] = await db
    .select({
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.orgId, orgId))
    .limit(1);
  return admin;
}

/**
 * POST /api/webhooks/paystack
 * Handles Paystack webhook events for subscription billing.
 *
 * Events handled:
 * - charge.success  → mark subscription active, save auth code, send receipt
 * - charge.failed   → mark subscription past_due, send dunning email
 * - subscription.disable → mark subscription canceled
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
        const amount = data.amount as number; // in kobo
        const now = new Date();

        const [sub] = await db
          .select()
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.orgId, orgId))
          .limit(1);

        // Dedup: skip if this reference was already processed.
        if (sub && sub.lastPaymentReference === reference) {
          return NextResponse.json({ received: true, deduped: true });
        }

        // Check if this is a plan-upgrade checkout.
        const txnPlanId = metadata.planId as string | undefined;
        const isPlanUpgrade = metadata.isPlanUpgrade === true;

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
              // Apply plan change if this was an upgrade checkout.
              ...(isPlanUpgrade && txnPlanId ? { planId: txnPlanId } : {}),
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

        // Revalidate app pages so new plan/status reflects.
        revalidatePath("/billing");
        revalidatePath("/dashboard");
        revalidatePath("/", "layout");

        // Send receipt email to the org admin.
        const billing = await getOrgBilling(orgId);
        const admin = await getOrgAdmin(orgId);
        const [org] = await db
          .select({ name: schema.organizations.name })
          .from(schema.organizations)
          .where(eq(schema.organizations.id, orgId))
          .limit(1);

        // In-app notification to all org members.
        await broadcastToOrg({
          orgId,
          type: "payment_success",
          title: "Payment received",
          body: `${billing.plan.planName} subscription — ₦${(amount / 100).toLocaleString()} charged successfully.`,
          link: "/billing",
        }).catch((e) => console.error("Notification failed:", e));

        if (admin) {
          await sendReceiptEmail({
            to: admin.email,
            userName: admin.name,
            orgName: org?.name ?? "your workspace",
            planName: billing.plan.planName,
            amount: amount / 100, // kobo → naira
            currency: billing.plan.currency,
            reference,
            memberCount: billing.memberCount,
            nextBillingDate: sub?.currentPeriodEnd ?? addMonths(now, 1),
            appUrl: process.env.APP_URL ?? "http://localhost:3000",
          }).catch((e) => console.error("Webhook receipt email failed:", e));
        }
        break;
      }

      case "charge.failed": {
        const [sub] = await db
          .select()
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.orgId, orgId))
          .limit(1);

        if (sub) {
          const graceEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
          await db
            .update(schema.subscriptions)
            .set({
              status: "past_due",
              graceEndsAt,
              updatedAt: new Date(),
            })
            .where(eq(schema.subscriptions.id, sub.id));
        }

        await logEvent(orgId, "subscription_updated", {
          actorId: undefined,
          meta: { action: "charge_failed", reference },
        });

        // In-app notification to all org members.
        await broadcastToOrg({
          orgId,
          type: "payment_failed",
          title: "Payment failed",
          body: `We couldn't charge your card. Please update your payment method to avoid service interruption.`,
          link: "/billing",
        }).catch((e) => console.error("Notification failed:", e));

        // Send dunning email to the org admin.
        const billing = await getOrgBilling(orgId);
        const admin = await getOrgAdmin(orgId);
        const [org] = await db
          .select({ name: schema.organizations.name })
          .from(schema.organizations)
          .where(eq(schema.organizations.id, orgId))
          .limit(1);

        if (admin) {
          await sendPaymentFailedEmail({
            to: admin.email,
            userName: admin.name,
            orgName: org?.name ?? "your workspace",
            amount: billing.monthlyAmount,
            currency: billing.plan.currency,
            graceDays: 3,
            appUrl: process.env.APP_URL ?? "http://localhost:3000",
          }).catch((e) => console.error("Webhook dunning email failed:", e));
        }
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
