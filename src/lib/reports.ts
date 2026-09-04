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

  for (const m of members) {
    const [totalRow] = await db
      .select({ count: count() })
      .from(schema.leads)
      .where(
        and(eq(schema.leads.orgId, orgId), eq(schema.leads.assigneeId, m.userId)),
      );

    const [overdueRow] = await db
      .select({ count: count() })
      .from(schema.reminders)
      .where(
        and(
          eq(schema.reminders.orgId, orgId),
          eq(schema.reminders.assigneeId, m.userId),
          eq(schema.reminders.status, "pending"),
          sql`${schema.reminders.dueAt} < NOW()`,
        ),
      );

    const won = wonIds.length
      ? (await db
          .select({ count: count() })
          .from(schema.leads)
          .where(
            and(
              eq(schema.leads.orgId, orgId),
              eq(schema.leads.assigneeId, m.userId),
              inArray(schema.leads.stageId, wonIds),
            ),
          ))[0].count
      : 0;

    const lost = lostIds.length
      ? (await db
          .select({ count: count() })
          .from(schema.leads)
          .where(
            and(
              eq(schema.leads.orgId, orgId),
              eq(schema.leads.assigneeId, m.userId),
              inArray(schema.leads.stageId, lostIds),
            ),
          ))[0].count
      : 0;

    const decided = won + lost;
    result.push({
      userId: m.userId,
      name: m.name,
      totalLeads: totalRow.count,
      overdue: overdueRow.count,
      won,
      lost,
      winRate: decided > 0 ? Math.round((won / decided) * 100) : 0,
    });
  }

  return result;
}
