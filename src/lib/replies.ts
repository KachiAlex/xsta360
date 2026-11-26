import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";

export interface InboundReply {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  preview: string;
  consentAction: string | null;
  pausedEnrollments: number;
  createdAt: Date;
}

/**
 * All inbound WhatsApp messages for an org, newest first.
 * Sourced from audit_events rows stamped channel=whatsapp_inbound by the
 * Meta webhook handler.
 */
export async function getOrgReplies(
  orgId: string,
  limit = 100,
): Promise<InboundReply[]> {
  const rows = await db
    .select({
      id: schema.auditEvents.id,
      leadId: schema.auditEvents.leadId,
      leadName: schema.leads.name,
      leadPhone: schema.leads.phone,
      meta: schema.auditEvents.meta,
      createdAt: schema.auditEvents.createdAt,
    })
    .from(schema.auditEvents)
    .innerJoin(schema.leads, eq(schema.auditEvents.leadId, schema.leads.id))
    .where(
      and(
        eq(schema.auditEvents.orgId, orgId),
        sql`${schema.auditEvents.meta}->>'channel' = 'whatsapp_inbound'`,
      ),
    )
    .orderBy(desc(schema.auditEvents.createdAt))
    .limit(limit);

  return rows.map((r) => {
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      leadId: r.leadId!,
      leadName: r.leadName,
      leadPhone: r.leadPhone,
      preview: String(meta.preview ?? ""),
      consentAction: (meta.consentAction as string) ?? null,
      pausedEnrollments: Number(meta.pausedEnrollments ?? 0),
      createdAt: r.createdAt,
    };
  });
}
