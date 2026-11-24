import "server-only";
import { and, count, eq, gte, isNull, ne, or } from "drizzle-orm";
import { db, schema } from "@/db";

export interface OrgSendUsage {
  emailsThisMonth: number;
  whatsappThisMonth: number;
  whatsappToday: number;
}

/**
 * Outbound send counts for an org this calendar month (UTC) — sourced from
 * the reminders table, which records one row per attempted send:
 *   channel='whatsapp' → Meta-billed message (tenant's card)
 *   channel='email'/'reminder'/null → SMTP send (platform Brevo account)
 * status='sent' means the provider accepted it, i.e. the billable event.
 */
export async function getOrgSendUsage(orgId: string, now = new Date()): Promise<OrgSendUsage> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [emailRows, waMonthRows, waDayRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(schema.reminders)
      .where(
        and(
          eq(schema.reminders.orgId, orgId),
          eq(schema.reminders.status, "sent"),
          or(isNull(schema.reminders.channel), ne(schema.reminders.channel, "whatsapp")),
          gte(schema.reminders.createdAt, monthStart),
        ),
      ),
    db
      .select({ value: count() })
      .from(schema.reminders)
      .where(
        and(
          eq(schema.reminders.orgId, orgId),
          eq(schema.reminders.status, "sent"),
          eq(schema.reminders.channel, "whatsapp"),
          gte(schema.reminders.createdAt, monthStart),
        ),
      ),
    db
      .select({ value: count() })
      .from(schema.reminders)
      .where(
        and(
          eq(schema.reminders.orgId, orgId),
          eq(schema.reminders.status, "sent"),
          eq(schema.reminders.channel, "whatsapp"),
          gte(schema.reminders.createdAt, dayStart),
        ),
      ),
  ]);

  return {
    emailsThisMonth: emailRows[0]?.value ?? 0,
    whatsappThisMonth: waMonthRows[0]?.value ?? 0,
    whatsappToday: waDayRows[0]?.value ?? 0,
  };
}

/**
 * Abuse circuit breaker: if ≥40% of an org's WhatsApp sends in the last
 * 24h failed (min 10 attempts), treat the channel as unhealthy and hold
 * API sends. Protects both the tenant's WABA quality rating and the
 * platform's Tech Provider standing.
 */
export async function isOrgWhatsAppThrottled(orgId: string, now = new Date()): Promise<boolean> {
  const windowStart = new Date(now.getTime() - 24 * 3600_000);

  const [totalRows, failRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(schema.reminders)
      .where(
        and(
          eq(schema.reminders.orgId, orgId),
          eq(schema.reminders.channel, "whatsapp"),
          gte(schema.reminders.createdAt, windowStart),
        ),
      ),
    db
      .select({ value: count() })
      .from(schema.reminders)
      .where(
        and(
          eq(schema.reminders.orgId, orgId),
          eq(schema.reminders.channel, "whatsapp"),
          or(eq(schema.reminders.status, "failed"), eq(schema.reminders.deliveryStatus, "failed")),
          gte(schema.reminders.createdAt, windowStart),
        ),
      ),
  ]);

  const total = totalRows[0]?.value ?? 0;
  const failed = failRows[0]?.value ?? 0;
  return total >= 10 && failed / total >= 0.4;
}

/** Whether a specific lead is opted out on a channel. */
export function channelOptedOut(
  lead: { unsubscribedAt: Date | null; whatsappOptOutAt: Date | null },
  channel: "email" | "whatsapp",
): boolean {
  return channel === "email" ? lead.unsubscribedAt != null : lead.whatsappOptOutAt != null;
}
