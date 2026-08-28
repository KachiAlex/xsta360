import "server-only";
import { db, schema } from "@/db";
import type { AuditEventType } from "@/db/schema";

/** Append an audit event to the org's timeline + analytics log.
 *  Pass `null` for orgId on platform-level events (superadmin actions). */
export async function logEvent(
  orgId: string | null,
  type: AuditEventType,
  data: { leadId?: string; actorId?: string; meta?: Record<string, unknown> },
) {
  await db.insert(schema.auditEvents).values({
    orgId,
    leadId: data.leadId,
    actorId: data.actorId,
    type,
    meta: data.meta,
  });
}
