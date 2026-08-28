import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export interface LeadDetail {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  campaign: string | null;
  notes: string | null;
  stageId: string | null;
  stageName: string | null;
  stageKind: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  lostReasonText: string | null;
  value: string | null;
  expectedCloseDate: Date | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface HistoryEntry {
  type: "remark" | "stage_changed" | "reminder_set" | "reminder_completed" | "lead_assigned" | "lead_lost" | "lead_won" | "lead_created";
  at: Date;
  authorName: string | null;
  body: string | null;
  meta: Record<string, unknown> | null;
}

export async function getLeadDetail(orgId: string, leadId: string): Promise<LeadDetail | null> {
  const [row] = await db
    .select({
      id: schema.leads.id,
      name: schema.leads.name,
      company: schema.leads.company,
      email: schema.leads.email,
      phone: schema.leads.phone,
      source: schema.leads.source,
      campaign: schema.leads.campaign,
      notes: schema.leads.notes,
      stageId: schema.leads.stageId,
      stageName: schema.pipelineStages.name,
      stageKind: schema.pipelineStages.kind,
      assigneeId: schema.leads.assigneeId,
      assigneeName: schema.users.name,
      lostReasonText: schema.leads.lostReasonText,
      value: schema.leads.value,
      expectedCloseDate: schema.leads.expectedCloseDate,
      customFields: schema.leads.customFields,
      createdAt: schema.leads.createdAt,
      updatedAt: schema.leads.updatedAt,
    })
    .from(schema.leads)
    .leftJoin(schema.pipelineStages, eq(schema.leads.stageId, schema.pipelineStages.id))
    .leftJoin(schema.users, eq(schema.leads.assigneeId, schema.users.id))
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, orgId)))
    .limit(1);
  return row ? { ...row, customFields: row.customFields as Record<string, unknown> } : null;
}

export async function getLeadHistory(orgId: string, leadId: string): Promise<HistoryEntry[]> {
  // Remarks + audit events, merged and sorted by time descending.
  const [remarks, events] = await Promise.all([
    db
      .select({
        id: schema.remarks.id,
        at: schema.remarks.createdAt,
        authorName: schema.users.name,
        body: schema.remarks.body,
      })
      .from(schema.remarks)
      .leftJoin(schema.users, eq(schema.remarks.authorId, schema.users.id))
      .where(and(eq(schema.remarks.leadId, leadId), eq(schema.remarks.orgId, orgId)))
      .orderBy(desc(schema.remarks.createdAt)),
    db
      .select({
        id: schema.auditEvents.id,
        type: schema.auditEvents.type,
        at: schema.auditEvents.createdAt,
        authorName: schema.users.name,
        meta: schema.auditEvents.meta,
      })
      .from(schema.auditEvents)
      .leftJoin(schema.users, eq(schema.auditEvents.actorId, schema.users.id))
      .where(and(eq(schema.auditEvents.leadId, leadId), eq(schema.auditEvents.orgId, orgId)))
      .orderBy(desc(schema.auditEvents.createdAt)),
  ]);

  const remarkEntries: HistoryEntry[] = remarks.map((r) => ({
    type: "remark",
    at: r.at,
    authorName: r.authorName,
    body: r.body,
    meta: null,
  }));

  const eventEntries: HistoryEntry[] = events.map((e) => ({
    type: e.type as HistoryEntry["type"],
    at: e.at,
    authorName: e.authorName,
    body: null,
    meta: e.meta as Record<string, unknown> | null,
  }));

  return [...remarkEntries, ...eventEntries].sort((a, b) => b.at.getTime() - a.at.getTime());
}

export async function getLeadReminders(orgId: string, leadId: string) {
  return db
    .select()
    .from(schema.reminders)
    .where(and(eq(schema.reminders.leadId, leadId), eq(schema.reminders.orgId, orgId)))
    .orderBy(desc(schema.reminders.dueAt));
}
