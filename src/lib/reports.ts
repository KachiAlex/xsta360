import "server-only";
import { and, eq, inArray, sql, count } from "drizzle-orm";
import { db, schema } from "@/db";

export interface SourceStat {
  source: string;
  total: number;
  won: number;
  lost: number;
  conversionRate: number;
}

export async function getSourceReport(orgId: string): Promise<SourceStat[]> {
  const stages = await db
    .select({ id: schema.pipelineStages.id, kind: schema.pipelineStages.kind })
    .from(schema.pipelineStages)
    .where(eq(schema.pipelineStages.orgId, orgId));

  const wonIds = stages.filter((s) => s.kind === "won").map((s) => s.id);
  const lostIds = stages.filter((s) => s.kind === "lost").map((s) => s.id);

  const rows = await db
    .select({
      source: schema.leads.source,
      total: count(),
    })
    .from(schema.leads)
    .where(eq(schema.leads.orgId, orgId))
    .groupBy(schema.leads.source);

  // Count won + lost per source.
  const wonRows = wonIds.length
    ? await db
        .select({ source: schema.leads.source, won: count() })
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.orgId, orgId),
            inArray(schema.leads.stageId, wonIds),
          ),
        )
        .groupBy(schema.leads.source)
    : [];
  const lostRows = lostIds.length
    ? await db
        .select({ source: schema.leads.source, lost: count() })
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.orgId, orgId),
            inArray(schema.leads.stageId, lostIds),
          ),
        )
        .groupBy(schema.leads.source)
    : [];

  const wonMap = new Map(wonRows.map((r) => [r.source, r.won]));
  const lostMap = new Map(lostRows.map((r) => [r.source, r.lost]));

  return rows.map((r) => {
    const won = wonMap.get(r.source) ?? 0;
    const lost = lostMap.get(r.source) ?? 0;
    const decided = won + lost;
    return {
      source: r.source,
      total: r.total,
      won,
      lost,
      conversionRate: decided > 0 ? Math.round((won / decided) * 100) : 0,
    };
  });
}

export interface RepStat {
  userId: string;
  name: string;
  totalLeads: number;
  overdue: number;
  won: number;
  lost: number;
  winRate: number;
}

export async function getRepReport(orgId: string): Promise<RepStat[]> {
  const members = await db
    .select({ userId: schema.users.id, name: schema.users.name })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.orgId, orgId));

  const stages = await db
    .select({ id: schema.pipelineStages.id, kind: schema.pipelineStages.kind })
    .from(schema.pipelineStages)
    .where(eq(schema.pipelineStages.orgId, orgId));
  const wonIds = stages.filter((s) => s.kind === "won").map((s) => s.id);
  const lostIds = stages.filter((s) => s.kind === "lost").map((s) => s.id);

  const result: RepStat[] = [];

  // Single GROUP BY query for total leads per rep.
  const totalRows = await db
    .select({
      assigneeId: schema.leads.assigneeId,
      total: count(),
    })
    .from(schema.leads)
    .where(eq(schema.leads.orgId, orgId))
    .groupBy(schema.leads.assigneeId);
  const totalMap = new Map(totalRows.map((r) => [r.assigneeId, r.total]));

  // Single GROUP BY query for overdue reminders per rep.
  const overdueRows = await db
    .select({
      assigneeId: schema.reminders.assigneeId,
      overdue: count(),
    })
    .from(schema.reminders)
    .where(
      and(
        eq(schema.reminders.orgId, orgId),
        eq(schema.reminders.status, "pending"),
        sql`${schema.reminders.dueAt} < NOW()`,
      ),
    )
    .groupBy(schema.reminders.assigneeId);
  const overdueMap = new Map(overdueRows.map((r) => [r.assigneeId, r.overdue]));

  // Won/lost per rep via filtered GROUP BY.
  const wonRows = wonIds.length
    ? await db
        .select({
          assigneeId: schema.leads.assigneeId,
          won: count(),
        })
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.orgId, orgId),
            inArray(schema.leads.stageId, wonIds),
          ),
        )
        .groupBy(schema.leads.assigneeId)
    : [];
  const wonMap = new Map(wonRows.map((r) => [r.assigneeId, r.won]));

  const lostRows = lostIds.length
    ? await db
        .select({
          assigneeId: schema.leads.assigneeId,
          lost: count(),
        })
        .from(schema.leads)
        .where(
          and(
            eq(schema.leads.orgId, orgId),
            inArray(schema.leads.stageId, lostIds),
          ),
        )
        .groupBy(schema.leads.assigneeId)
    : [];
  const lostMap = new Map(lostRows.map((r) => [r.assigneeId, r.lost]));

  for (const m of members) {
    const won = wonMap.get(m.userId) ?? 0;
    const lost = lostMap.get(m.userId) ?? 0;
    const decided = won + lost;
    result.push({
      userId: m.userId,
      name: m.name,
      totalLeads: totalMap.get(m.userId) ?? 0,
      overdue: overdueMap.get(m.userId) ?? 0,
      won,
      lost,
      winRate: decided > 0 ? Math.round((won / decided) * 100) : 0,
    });
  }

  return result;
}
