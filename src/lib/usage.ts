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
