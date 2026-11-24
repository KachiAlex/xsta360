import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { createHmac, randomUUID } from "crypto";
import { db, schema } from "@/db";

/**
 * Outbound webhooks: POST signed event payloads to org-registered URLs.
 * Used by API-driven clients (WooCommerce stores etc.) to react to
 * delivery receipts, replies, and opt-outs.
 */

export type OrgWebhookEvent =
  | "message.sent"
  | "message.delivered"
  | "message.read"
  | "message.failed"
  | "contact.replied"
  | "contact.opted_out";

export const ORG_WEBHOOK_EVENTS: OrgWebhookEvent[] = [
  "message.sent",
  "message.delivered",
  "message.read",
  "message.failed",
  "contact.replied",
  "contact.opted_out",
];

/**
 * Validate a webhook URL at registration time. HTTPS only, and refuse
 * obvious internal targets (SSRF guard — literal host checks; full DNS
 * pinning would need a resolver call at registration).
 */
export function validateWebhookUrl(raw: string): { ok: boolean; error?: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, error: "Webhook URL must use https" };
  }
  const host = url.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^0\./.test(host);
  if (blocked) return { ok: false, error: "Webhook URL cannot point to a private or local address" };
  return { ok: true };
}

/**
 * Fan an event out to every active subscription for the org.
 * Best-effort: failures are logged and stamped on the webhook row but
 * never thrown — delivery must not break the calling flow.
 */
export async function dispatchOrgWebhook(
  orgId: string,
  event: OrgWebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  const hooks = await db
    .select({
      id: schema.orgWebhooks.id,
      url: schema.orgWebhooks.url,
      secret: schema.orgWebhooks.secret,
    })
    .from(schema.orgWebhooks)
    .where(
      and(
        eq(schema.orgWebhooks.orgId, orgId),
        eq(schema.orgWebhooks.active, true),
        sql`${schema.orgWebhooks.events} @> ${JSON.stringify([event])}::jsonb`,
      ),
    );
  if (hooks.length === 0) return;

  const deliveryId = randomUUID();
  const timestamp = new Date().toISOString();
  const payload = { id: deliveryId, event, createdAt: timestamp, data };
  const body = JSON.stringify(payload);

  for (const hook of hooks) {
    const signature = createHmac("sha256", hook.secret)
      .update(`${deliveryId}.${timestamp}.${body}`)
      .digest("hex");
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-xsta-event": event,
          "x-xsta-delivery": deliveryId,
          "x-xsta-timestamp": timestamp,
          "x-xsta-signature": `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      await db
        .update(schema.orgWebhooks)
        .set(
          res.ok
            ? { lastDeliveredAt: new Date(), lastError: null }
            : { lastError: `HTTP ${res.status}` },
        )
        .where(eq(schema.orgWebhooks.id, hook.id))
        .catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "delivery failed";
      console.error(`Webhook ${hook.id} → ${hook.url} failed:`, msg);
      await db
        .update(schema.orgWebhooks)
        .set({ lastError: msg.slice(0, 500) })
        .where(eq(schema.orgWebhooks.id, hook.id))
        .catch(() => {});
    }
  }
}
