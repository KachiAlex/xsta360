import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Contact (lead) resolution for the public API — find by contactId, email,
 * or phone; create when absent. Consent fields map onto the channel-scoped
 * opt-in/out columns.
 */

export interface ApiContactInput {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  optIn?: {
    whatsapp?: { source?: string; at?: string } | boolean;
  };
  optOut?: { whatsapp?: boolean; email?: boolean };
}

export type ApiLead = typeof schema.leads.$inferSelect;

/** Find a lead by id/email/phone within the org (any one may match). */
export async function findApiLead(
  orgId: string,
  q: { contactId?: string; email?: string; phone?: string },
): Promise<ApiLead | null> {
  if (q.contactId) {
    const [lead] = await db
      .select()
      .from(schema.leads)
      .where(and(eq(schema.leads.id, q.contactId), eq(schema.leads.orgId, orgId)))
      .limit(1);
    return lead ?? null;
  }
  if (q.email) {
    const [lead] = await db
      .select()
      .from(schema.leads)
      .where(
        and(
          eq(schema.leads.orgId, orgId),
          sql`lower(${schema.leads.email}) = ${q.email.toLowerCase()}`,
        ),
      )
      .limit(1);
    if (lead) return lead;
  }
  if (q.phone) {
    const digits = q.phone.replace(/\D/g, "");
    if (digits.length >= 7) {
      const [lead] = await db
        .select()
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.orgId, orgId),
            sql`regexp_replace(${schema.leads.phone}, '[^0-9]', '', 'g') LIKE ${"%" + digits.slice(-10)}`,
          ),
        )
        .limit(1);
      if (lead) return lead;
    }
  }
  return null;
}

/**
 * Upsert a contact: match on contactId → email → phone; update provided
 * fields and consent flags; create a lead when no match exists.
 */
export async function upsertApiContact(
  orgId: string,
  input: ApiContactInput,
): Promise<{ lead: ApiLead; created: boolean }> {
  const now = new Date();
  const existing = await findApiLead(orgId, {
    email: input.email,
    phone: input.phone,
  });

  const consentUpdate: Record<string, unknown> = {};
  const waIn = input.optIn?.whatsapp;
  if (waIn) {
    consentUpdate.whatsappOptInAt = typeof waIn === "object" && waIn.at ? new Date(waIn.at) : now;
    consentUpdate.whatsappOptInSource =
      (typeof waIn === "object" && waIn.source) || "api";
    consentUpdate.whatsappOptOutAt = null;
  }
  if (input.optOut?.whatsapp) {
    consentUpdate.whatsappOptOutAt = now;
  }
  if (input.optOut?.email) {
    consentUpdate.unsubscribedAt = now;
  }

  if (existing) {
    const update: Record<string, unknown> = { updatedAt: now, ...consentUpdate };
    if (input.name) update.name = input.name;
    if (input.email) update.email = input.email;
    if (input.phone) update.phone = input.phone;
    if (input.company !== undefined) update.company = input.company;
    const [lead] = await db
      .update(schema.leads)
      .set(update)
      .where(eq(schema.leads.id, existing.id))
      .returning();
    return { lead, created: false };
  }

  const [lead] = await db
    .insert(schema.leads)
    .values({
      orgId,
      name: input.name?.trim() || input.email || input.phone || "API contact",
      email: input.email ?? null,
      phone: input.phone ?? null,
      company: input.company ?? null,
      source: "other",
      campaign: "api",
      ...consentUpdate,
    })
    .returning();
  return { lead, created: true };
}
