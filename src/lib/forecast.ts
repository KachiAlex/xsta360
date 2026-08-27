import "server-only";
import { and, eq, sql, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export interface ForecastRow {
  stageId: string;
  stageName: string;
  stageKind: string;
  probability: number;
  leadCount: number;
  totalValue: number;
  weightedValue: number;
}

export interface ForecastSummary {
  stages: ForecastRow[];
  totalPipelineValue: number;
  totalWeightedValue: number;
  totalLeads: number;
  wonValue: number;
  wonCount: number;
  lostCount: number;
}

/**
 * Pipeline forecast: groups open leads by stage, calculates total and
 * weighted (probability-adjusted) deal values.
 */
export async function getPipelineForecast(orgId: string): Promise<ForecastSummary> {
  const stages = await db
    .select()
    .from(schema.pipelineStages)
    .where(eq(schema.pipelineStages.orgId, orgId))
    .orderBy(schema.pipelineStages.position);

  const leads = await db
    .select({
      id: schema.leads.id,
      stageId: schema.leads.stageId,
      value: schema.leads.value,
    })
    .from(schema.leads)
    .where(eq(schema.leads.orgId, orgId));

  const stageMap = new Map(stages.map((s) => [s.id, s]));

  const rows: ForecastRow[] = stages.map((stage) => {
    const stageLeads = leads.filter((l) => l.stageId === stage.id);
    const totalValue = stageLeads.reduce((sum, l) => {
      const v = l.value ? parseFloat(l.value) : 0;
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
    const weightedValue = (totalValue * stage.probability) / 100;

    return {
      stageId: stage.id,
      stageName: stage.name,
      stageKind: stage.kind,
      probability: stage.probability,
      leadCount: stageLeads.length,
      totalValue,
      weightedValue,
    };
  });

  const openStages = rows.filter((r) => r.stageKind === "open");
  const wonStages = rows.filter((r) => r.stageKind === "won");
  const lostStages = rows.filter((r) => r.stageKind === "lost");

  const totalPipelineValue = openStages.reduce((s, r) => s + r.totalValue, 0);
  const totalWeightedValue = openStages.reduce((s, r) => s + r.weightedValue, 0);
  const totalLeads = openStages.reduce((s, r) => s + r.leadCount, 0);
  const wonValue = wonStages.reduce((s, r) => s + r.totalValue, 0);
  const wonCount = wonStages.reduce((s, r) => s + r.leadCount, 0);
  const lostCount = lostStages.reduce((s, r) => s + r.leadCount, 0);

  return {
    stages: rows,
    totalPipelineValue,
    totalWeightedValue,
    totalLeads,
    wonValue,
    wonCount,
    lostCount,
  };
}

export function formatCurrency(value: number, currency: string = "₦"): string {
  if (value >= 1_000_000) {
    return `${currency}${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${currency}${(value / 1_000).toFixed(1)}K`;
  }
  return `${currency}${value.toFixed(0)}`;
}
