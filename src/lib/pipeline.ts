import "server-only";
import { asc, eq, and, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export interface PipelineColumn {
  id: string;
  name: string;
  kind: "open" | "won" | "lost";
  position: number;
  leads: {
    id: string;
    name: string;
    company: string | null;
    source: string;
  }[];
}

export async function getPipelineBoard(orgId: string, categoryId?: string): Promise<PipelineColumn[]> {
  const stages = await db
    .select()
    .from(schema.pipelineStages)
    .where(eq(schema.pipelineStages.orgId, orgId))
    .orderBy(asc(schema.pipelineStages.position));

  let leadQuery = db
    .select({
      id: schema.leads.id,
      name: schema.leads.name,
      company: schema.leads.company,
      source: schema.leads.source,
      stageId: schema.leads.stageId,
    })
    .from(schema.leads)
    .where(eq(schema.leads.orgId, orgId))
    .as("leadQuery");

  let leads;

  if (categoryId) {
    // Find lead IDs in this category first.
    const assignments = await db
      .select({ leadId: schema.leadCategoryAssignments.leadId })
      .from(schema.leadCategoryAssignments)
      .where(
        and(
          eq(schema.leadCategoryAssignments.orgId, orgId),
          eq(schema.leadCategoryAssignments.categoryId, categoryId),
        ),
      );

    if (assignments.length === 0) {
      return stages.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        position: s.position,
        leads: [],
      }));
    }

    const leadIds = assignments.map((a) => a.leadId);
    leads = await db
      .select({
        id: schema.leads.id,
        name: schema.leads.name,
        company: schema.leads.company,
        source: schema.leads.source,
        stageId: schema.leads.stageId,
      })
      .from(schema.leads)
      .where(and(eq(schema.leads.orgId, orgId), inArray(schema.leads.id, leadIds)));
  } else {
    leads = await db
      .select({
        id: schema.leads.id,
        name: schema.leads.name,
        company: schema.leads.company,
        source: schema.leads.source,
        stageId: schema.leads.stageId,
      })
      .from(schema.leads)
      .where(eq(schema.leads.orgId, orgId));
  }

  const byStage = new Map<string, PipelineColumn["leads"]>();
  for (const l of leads) {
    const key = l.stageId ?? "__unassigned";
    const arr = byStage.get(key) ?? [];
    arr.push({ id: l.id, name: l.name, company: l.company, source: l.source });
    byStage.set(key, arr);
  }

  return stages.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    position: s.position,
    leads: byStage.get(s.id) ?? [],
  }));
}
