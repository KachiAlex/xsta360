import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { logEvent } from "@/lib/audit";
import { broadcastToOrg } from "@/lib/notifications";
import { getConsentAction } from "@/lib/consent";
import { dispatchOrgWebhook } from "@/lib/outbound-webhooks";

export const dynamic = "force-dynamic";

/**
 * GET /api/webhooks/whatsapp — Meta webhook verification handshake.
 * Meta calls this once when you save the callback URL in app settings:
 * it sends hub.mode=subscribe, hub.verify_token, hub.challenge and
 * expects the challenge echoed back as plain text.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

interface WaStatus {
  id: string;
  status: string;
  recipient_id: string;
  timestamp: string;
  errors?: { code?: number; title?: string }[];
}

interface WaInboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface WaChangeValue {
  metadata?: { phone_number_id?: string };
  statuses?: WaStatus[];
  messages?: WaInboundMessage[];
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  // message_template_status_update payloads
  event?: string;
  message_template_name?: string;
  message_template_language?: string;
  reason?: string;
}

/**
 * Meta template status/quality events — notify the org when a template is
 * paused or a send limit hit, so they can act before the WABA rating drops.
 * entry.id is the WABA id.
 */
async function handleTemplateStatusUpdate(wabaId: string, value?: WaChangeValue) {
  if (!wabaId || !value) return;
  const [org] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(sql`${schema.organizations.whatsappConfig}->>'wabaId' = ${wabaId}`)
    .limit(1);
  if (!org) return;
  await broadcastToOrg({
    orgId: org.id,
    type: "sequence_step",
    title: `WhatsApp template ${value.message_template_name ?? ""} — ${value.event ?? "status update"}`,
    body: value.reason ? `Reason: ${value.reason}` : "Check your WhatsApp template status in Meta Business Suite.",
    link: "/settings",
  }).catch((e) => console.error("Template-status notification failed:", e));
}

/**
 * POST /api/webhooks/whatsapp — Meta event delivery.
 *
 * Handles two event shapes inside change.field === "messages":
 * - statuses[]  → delivery/read/failed receipts: matched to reminder rows
 *   by wamid; a failure pauses the enrollment behind that send.
 * - messages[]  → inbound replies: pauses the sender's active sequence
 *   enrollments so a lead who replies stops getting automated follow-ups.
 *
 * Org resolution: value.metadata.phone_number_id → org.whatsappConfig.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  // Optional signature verification when META_APP_SECRET is configured.
  const appSecret = process.env.META_APP_SECRET;
  if (appSecret) {
    const signature = request.headers.get("x-hub-signature-256") ?? "";
    const crypto = await import("node:crypto");
    const expected =
      "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: {
    object?: string;
    entry?: { id?: string; changes?: { field?: string; value?: WaChangeValue }[] }[];
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Always 200 — Meta retries on non-2xx, and unknown payloads are safe to drop.
  if (payload.object !== "whatsapp_business_account") {
    return NextResponse.json({ received: true, skipped: true });
  }

  try {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        // Hosted embedded signup lifecycle events (e.g. PARTNER_ADDED when a
        // client completes onboarding). The claim flow queries the provider's
        // client WABA list live, so we only log these — they're informational.
        if (change.field === "account_update") {
          console.log("WhatsApp account_update:", JSON.stringify(change.value));
          continue;
        }
        // Template quality/status changes — Meta sends these under the WABA
        // id (entry.id), which maps to org.whatsappConfig.wabaId.
        if (change.field === "message_template_status_update") {
          await handleTemplateStatusUpdate(entry.id ?? "", change.value).catch((e) =>
            console.error("Template status update failed:", e),
          );
          continue;
        }
        if (change.field !== "messages" || !change.value) continue;
        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // Delivery receipts — update the reminder row that carries this wamid.
        for (const status of value.statuses ?? []) {
          const errs = (status.errors ?? [])
            .map((e: { code?: number; title?: string }) => `${e.code} ${e.title ?? ""}`.trim())
            .join("; ");
          console.log(
            `WhatsApp status: ${status.status} for ${status.id} → ${status.recipient_id}${errs ? ` [${errs}]` : ""}`,
          );
          await handleDeliveryReceipt(status, errs).catch((e) =>
            console.error("Delivery receipt handling failed:", e),
          );
        }

        // Inbound messages — pause sequences for the replying lead.
        for (const msg of value.messages ?? []) {
          await handleInboundMessage(phoneNumberId, msg);
        }
      }
    }
  } catch (err) {
    console.error("WhatsApp webhook processing error:", err);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// Receipt progress ordering — a later status never overwrites a further one.
const DELIVERY_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };

/**
 * Correlate a Meta status receipt to the reminder row that carries its wamid.
 * Progresses deliveryStatus sent → delivered → read; a "failed" receipt marks
 * the row failed and pauses the enrollment that produced the send — a number
 * that can't receive messages shouldn't keep burning template steps.
 */
async function handleDeliveryReceipt(status: WaStatus, errs: string) {
  const [reminder] = await db
    .select({
      id: schema.reminders.id,
      leadId: schema.reminders.leadId,
      orgId: schema.reminders.orgId,
      sequenceStepId: schema.reminders.sequenceStepId,
      deliveryStatus: schema.reminders.deliveryStatus,
    })
    .from(schema.reminders)
    .where(eq(schema.reminders.wamid, status.id))
    .limit(1);
  if (!reminder) return; // Message not sent from a tracked flow — nothing to update.

  const now = new Date();
  const receiptAt = status.timestamp ? new Date(Number(status.timestamp) * 1000) : now;

  if (status.status === "failed") {
    // A late terminal "failed" shouldn't overwrite "read" — Meta can emit
    // statuses out of order; read is a stronger signal than failed.
    if (reminder.deliveryStatus === "read") return;
    await db
      .update(schema.reminders)
      .set({ deliveryStatus: "failed", lastError: errs || "Delivery failed", updatedAt: now })
      .where(eq(schema.reminders.id, reminder.id));

    if (!reminder.sequenceStepId) return;
    const [step] = await db
      .select({ sequenceId: schema.sequenceSteps.sequenceId })
      .from(schema.sequenceSteps)
      .where(eq(schema.sequenceSteps.id, reminder.sequenceStepId))
      .limit(1);
    if (!step) return;

    const paused = await db
      .update(schema.sequenceEnrollments)
      .set({
        status: "paused",
        pausedReason: "delivery_failed",
        pausedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.sequenceEnrollments.orgId, reminder.orgId),
          eq(schema.sequenceEnrollments.leadId, reminder.leadId),
          eq(schema.sequenceEnrollments.sequenceId, step.sequenceId),
          inArray(schema.sequenceEnrollments.status, ["active", "processing"]),
        ),
      )
      .returning({ id: schema.sequenceEnrollments.id });

    if (paused.length > 0) {
      const [lead] = await db
        .select({ name: schema.leads.name })
        .from(schema.leads)
        .where(eq(schema.leads.id, reminder.leadId))
        .limit(1);
      await broadcastToOrg({
        orgId: reminder.orgId,
        type: "sequence_step",
        title: `WhatsApp delivery failed for ${lead?.name ?? "a lead"}`,
        body: `${errs || "Message not delivered"} — sequence paused.`,
        link: `/leads/${reminder.leadId}`,
      }).catch((e) => console.error("Delivery-failure notification failed:", e));
    }
    void dispatchOrgWebhook(reminder.orgId, "message.failed", {
      channel: "whatsapp",
      messageId: reminder.id,
      wamid: status.id,
      contactId: reminder.leadId,
      error: errs || "Delivery failed",
    }).catch(() => {});
    return;
  }

  const rank = DELIVERY_RANK[status.status] ?? 0;
  if (rank > (DELIVERY_RANK[reminder.deliveryStatus ?? ""] ?? 0)) {
    await db
      .update(schema.reminders)
      .set({ deliveryStatus: status.status, deliveredAt: receiptAt, updatedAt: now })
      .where(eq(schema.reminders.id, reminder.id));
    const evt = status.status === "read" ? "message.read" : "message.delivered";
    void dispatchOrgWebhook(reminder.orgId, evt, {
      channel: "whatsapp",
      messageId: reminder.id,
      wamid: status.id,
      contactId: reminder.leadId,
    }).catch(() => {});
  }
}

/**
 * Resolve the org by phone_number_id, find the lead whose phone matches the
 * sender, pause their active enrollments, and notify the org.
 */
async function handleInboundMessage(phoneNumberId: string, msg: WaInboundMessage) {
  const senderDigits = msg.from.replace(/\D/g, "");

  const [org] = await db
    .select({ id: schema.organizations.id, name: schema.organizations.name })
    .from(schema.organizations)
    .where(sql`${schema.organizations.whatsappConfig}->>'phoneNumberId' = ${phoneNumberId}`)
    .limit(1);
  if (!org) return;

  // Match lead by phone digits — stored formats vary (+234…, 0803…, etc).
  const [lead] = await db
    .select({ id: schema.leads.id, name: schema.leads.name })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.orgId, org.id),
        sql`regexp_replace(${schema.leads.phone}, '[^0-9]', '', 'g') LIKE ${"%" + senderDigits.slice(-10)}`,
      ),
    )
    .limit(1);
  if (!lead) return;

  const now = new Date();
  const text = msg.type === "text" ? (msg.text?.body ?? "") : "";
  const consentAction = getConsentAction(text);

  // Stamp the 24h service window — sequence steps prefer free-form sends
  // while it's open, which also avoids Meta's marketing-template cap.
  // Consent keywords update the channel opt-in/out record alongside.
  const leadUpdate: Record<string, unknown> = {
    lastWhatsappInboundAt: now,
    updatedAt: now,
  };
  if (consentAction === "out") {
    leadUpdate.whatsappOptOutAt = now;
  } else if (consentAction === "in") {
    leadUpdate.whatsappOptOutAt = null;
    leadUpdate.whatsappOptInAt = now;
    leadUpdate.whatsappOptInSource = "inbound_start";
  }
  await db.update(schema.leads).set(leadUpdate).where(eq(schema.leads.id, lead.id));

  const paused = await db
    .update(schema.sequenceEnrollments)
    .set({
      status: "paused",
      pausedReason: consentAction === "out" ? "unsubscribed" : "reply",
      pausedAt: now,
      repliedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.sequenceEnrollments.orgId, org.id),
        eq(schema.sequenceEnrollments.leadId, lead.id),
        inArray(schema.sequenceEnrollments.status, ["active", "processing"]),
      ),
    )
    .returning({ id: schema.sequenceEnrollments.id });

  const preview = msg.type === "text" ? (msg.text?.body ?? "").slice(0, 120) : `[${msg.type}]`;

  await logEvent(org.id, "activity_logged", {
    leadId: lead.id,
    meta: {
      channel: "whatsapp_inbound",
      preview,
      pausedEnrollments: paused.length,
      ...(consentAction ? { consentAction } : {}),
    },
  });

  // An opt-out is binding whether or not any enrollment was active —
  // always surface it so the org knows the channel is closed.
  if (consentAction === "out") {
    await broadcastToOrg({
      orgId: org.id,
      type: "sequence_step",
      title: `${lead.name} opted out of WhatsApp`,
      body: `"${preview || "STOP"}" — WhatsApp sends to this contact are now blocked.`,
      link: `/leads/${lead.id}`,
    }).catch((e) => console.error("Opt-out notification failed:", e));
    void dispatchOrgWebhook(org.id, "contact.opted_out", {
      contactId: lead.id,
      channel: "whatsapp",
      keyword: preview,
    }).catch(() => {});
    return;
  }

  if (consentAction === null) {
    void dispatchOrgWebhook(org.id, "contact.replied", {
      contactId: lead.id,
      channel: "whatsapp",
      preview,
    }).catch(() => {});
  }

  if (paused.length > 0) {
    await broadcastToOrg({
      orgId: org.id,
      type: "sequence_step",
      title: `${lead.name} replied on WhatsApp`,
      body: `Paused ${paused.length} active sequence${paused.length === 1 ? "" : "s"}. "${preview}"`,
      link: `/leads/${lead.id}`,
    }).catch((e) => console.error("Reply notification failed:", e));
  }
}
