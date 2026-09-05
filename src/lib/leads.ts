import "server-only";
import { and, desc, eq, ilike, or, inArray } from "drizzle-orm";
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
  value: string | null;
  score: number;
  expectedCloseDate: Date | null;
  customFields: unknown;
  createdAt: Date;
  updatedAt: Date;
  categories: { id: string; name: string; icon: string; color: string }[];
}

export interface LeadListFilters {
  q?: string;
  stageId?: string;
  source?: string;
  assigneeId?: string;
  categoryId?: string;
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

  // Category filter: find lead IDs in that category first, then filter.
  let categoryFilteredLeadIds: string[] | null = null;
  if (filters.categoryId) {
    const assignments = await db
      .select({ leadId: schema.leadCategoryAssignments.leadId })
      .from(schema.leadCategoryAssignments)
      .where(
        and(
          eq(schema.leadCategoryAssignments.orgId, orgId),
          eq(schema.leadCategoryAssignments.categoryId, filters.categoryId),
        ),
      );
    categoryFilteredLeadIds = assignments.map((a) => a.leadId);
    if (categoryFilteredLeadIds.length === 0) return [];
    conditions.push(inArray(schema.leads.id, categoryFilteredLeadIds));
  }

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
      value: schema.leads.value,
      score: schema.leads.score,
      expectedCloseDate: schema.leads.expectedCloseDate,
      customFields: schema.leads.customFields,
      createdAt: schema.leads.createdAt,
      updatedAt: schema.leads.updatedAt,
    })
    .from(schema.leads)
    .leftJoin(schema.pipelineStages, eq(schema.leads.stageId, schema.pipelineStages.id))
    .leftJoin(schema.users, eq(schema.leads.assigneeId, schema.users.id))
    .where(and(...conditions))
    .orderBy(desc(schema.leads.updatedAt));

  if (rows.length === 0) return [];

  // Fetch categories for all returned leads.
  const leadIds = rows.map((r) => r.id);
  const assignments = await db
    .select({
      leadId: schema.leadCategoryAssignments.leadId,
      categoryId: schema.leadCategories.id,
      categoryName: schema.leadCategories.name,
      categoryIcon: schema.leadCategories.icon,
      categoryColor: schema.leadCategories.color,
    })
    .from(schema.leadCategoryAssignments)
    .innerJoin(schema.leadCategories, eq(schema.leadCategoryAssignments.categoryId, schema.leadCategories.id))
    .where(
      and(
        eq(schema.leadCategoryAssignments.orgId, orgId),
        inArray(schema.leadCategoryAssignments.leadId, leadIds),
      ),
    );

  // Group categories by lead.
  const catMap = new Map<string, { id: string; name: string; icon: string; color: string }[]>();
  for (const a of assignments) {
    const arr = catMap.get(a.leadId) ?? [];
    arr.push({ id: a.categoryId, name: a.categoryName, icon: a.categoryIcon, color: a.categoryColor });
    catMap.set(a.leadId, arr);
  }

  return rows.map((r) => ({
    ...r,
    categories: catMap.get(r.id) ?? [],
  }));
}
