import "server-only";
import { asc, eq } from "drizzle-orm";
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

export async function getPipelineBoard(orgId: string): Promise<PipelineColumn[]> {
  const stages = await db
    .select()
    .from(schema.pipelineStages)
    .where(eq(schema.pipelineStages.orgId, orgId))
    .orderBy(asc(schema.pipelineStages.position));

  const leads = await db
    .select({
      id: schema.leads.id,
      name: schema.leads.name,
      company: schema.leads.company,
      source: schema.leads.source,
      stageId: schema.leads.stageId,
    })
    .from(schema.leads)
    .where(eq(schema.leads.orgId, orgId));

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
