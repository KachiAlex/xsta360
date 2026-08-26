import "server-only";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db, schema } from "@/db";

export interface LeadListItem {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  campaign: string | null;
  stageId: string | null;
  stageName: string | null;
  stageKind: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeadListFilters {
  q?: string;
  stageId?: string;
  source?: string;
  assigneeId?: string;
}

export async function getLeads(orgId: string, filters: LeadListFilters = {}): Promise<LeadListItem[]> {
  const conditions = [eq(schema.leads.orgId, orgId)];

  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push(
      or(
        ilike(schema.leads.name, like),
        ilike(schema.leads.company, like),
        ilike(schema.leads.email, like),
        ilike(schema.leads.campaign, like),
      )!,
    );
  }
  if (filters.stageId) conditions.push(eq(schema.leads.stageId, filters.stageId));
  if (filters.source) conditions.push(eq(schema.leads.source, filters.source as never));
  if (filters.assigneeId) conditions.push(eq(schema.leads.assigneeId, filters.assigneeId));

  const rows = await db
    .select({
      id: schema.leads.id,
      name: schema.leads.name,
      company: schema.leads.company,
      email: schema.leads.email,
      phone: schema.leads.phone,
      source: schema.leads.source,
      campaign: schema.leads.campaign,
      stageId: schema.leads.stageId,
      stageName: schema.pipelineStages.name,
      stageKind: schema.pipelineStages.kind,
      assigneeId: schema.leads.assigneeId,
      assigneeName: schema.users.name,
      createdAt: schema.leads.createdAt,
      updatedAt: schema.leads.updatedAt,
    })
    .from(schema.leads)
    .leftJoin(schema.pipelineStages, eq(schema.leads.stageId, schema.pipelineStages.id))
    .leftJoin(schema.users, eq(schema.leads.assigneeId, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.leads.updatedAt));

  return rows;
}
