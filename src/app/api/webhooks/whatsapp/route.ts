import { NextResponse } from "next/server";
import { db, schema } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { logEvent } from "@/lib/audit";
import { broadcastToOrg } from "@/lib/notifications";

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
}

/**
 * POST /api/webhooks/whatsapp — Meta event delivery.
 *
 * Handles two event shapes inside change.field === "messages":
 * - statuses[]  → delivery/read/failed receipts (logged; no wamid stored yet)
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

  let payload: { object?: string; entry?: { changes?: { field?: string; value?: WaChangeValue }[] }[] };
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
        if (change.field !== "messages" || !change.value) continue;
        const value = change.value;
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // Delivery receipts — logged for now (we don't store wamids yet).
        for (const status of value.statuses ?? []) {
          console.log(`WhatsApp status: ${status.status} for ${status.id} → ${status.recipient_id}`);
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

  const paused = await db
    .update(schema.sequenceEnrollments)
    .set({
      status: "paused",
      pausedReason: "reply",
      pausedAt: new Date(),
      repliedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.sequenceEnrollments.orgId, org.id),
        eq(schema.sequenceEnrollments.leadId, lead.id),
        eq(schema.sequenceEnrollments.status, "active"),
      ),
    )
    .returning({ id: schema.sequenceEnrollments.id });

  const preview = msg.type === "text" ? (msg.text?.body ?? "").slice(0, 120) : `[${msg.type}]`;

  await logEvent(org.id, "activity_logged", {
    leadId: lead.id,
    meta: { channel: "whatsapp_inbound", preview, pausedEnrollments: paused.length },
  });

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
