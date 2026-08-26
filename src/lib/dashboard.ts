import "server-only";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export interface FollowUpRow {
  leadId: string;
  leadName: string;
  company: string | null;
  source: string;
  lastRemarkBody: string | null;
  lastRemarkAt: Date | null;
  daysSinceContact: number | null;
  reminderId: string | null;
  reminderDueAt: Date | null;
  reminderStatus: string | null;
  bucket: "overdue" | "today" | "later";
  heat: "hot" | "warm" | "cold";
}

interface RawRow {
  leadId: string;
  leadName: string;
  company: string | null;
  source: string;
  lastRemarkBody: string | null;
  lastRemarkAt: Date | null;
  daysSinceContact: number | null;
  reminderId: string;
  reminderDueAt: Date;
  reminderStatus: string;
  bucket: "overdue" | "today" | "later";
  heat: "hot" | "warm" | "cold";
}

function startOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

/**
 * Today's Follow-Ups for a given user: leads with a pending reminder due today
 * or overdue, OR leads with no reminder at all that have gone quiet. Ordered
 * overdue first, then by reminder time.
 */
export async function getTodayFollowUps(orgId: string, userId: string): Promise<FollowUpRow[]> {
  const now = new Date();
  const eod = endOfDay(now);

  // Pending reminders assigned to the user, due today or earlier.
  const reminders = await db
    .select({
      reminderId: schema.reminders.id,
      leadId: schema.reminders.leadId,
      dueAt: schema.reminders.dueAt,
      status: schema.reminders.status,
    })
    .from(schema.reminders)
    .where(
      and(
        eq(schema.reminders.orgId, orgId),
        eq(schema.reminders.assigneeId, userId),
        eq(schema.reminders.status, "pending"),
        lte(schema.reminders.dueAt, eod),
      ),
    )
    .orderBy(asc(schema.reminders.dueAt));

  if (reminders.length === 0) return [];

  const leadIds = reminders.map((r) => r.leadId);

  // Load the leads + their latest remark in one pass.
  const leads = await db
    .select()
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.orgId, orgId),
        sql`${schema.leads.id} = ANY(${sql.raw(`ARRAY['${leadIds.join("','")}']::uuid[]`)})`,
      ),
    );

  const remarks = await db
    .select({
      leadId: schema.remarks.leadId,
      body: schema.remarks.body,
      createdAt: schema.remarks.createdAt,
    })
    .from(schema.remarks)
    .where(
      and(
        eq(schema.remarks.orgId, orgId),
        sql`${schema.remarks.leadId} = ANY(${sql.raw(`ARRAY['${leadIds.join("','")}']::uuid[]`)})`,
      ),
    )
    .orderBy(desc(schema.remarks.createdAt));

  // Index latest remark per lead.
  const latestRemark = new Map<string, { body: string; createdAt: Date }>();
  for (const r of remarks) {
    if (!latestRemark.has(r.leadId)) {
      latestRemark.set(r.leadId, { body: r.body, createdAt: r.createdAt });
    }
  }

  const leadMap = new Map(leads.map((l) => [l.id, l]));

  const rows: RawRow[] = reminders
    .map((r): RawRow | null => {
      const lead = leadMap.get(r.leadId);
      if (!lead) return null;
      const remark = latestRemark.get(r.leadId);
      const sod = startOfDay(r.dueAt);
      const isOverdue = r.dueAt < sod;
      const isToday = !isOverdue && r.dueAt <= eod;
      const bucket: RawRow["bucket"] = isOverdue ? "overdue" : isToday ? "today" : "later";
      const days = remark ? daysBetween(remark.createdAt, now) : null;
      const heat: RawRow["heat"] =
        bucket === "overdue" ? "cold" : days !== null && days <= 1 ? "hot" : "warm";
      return {
        leadId: lead.id,
        leadName: lead.name,
        company: lead.company,
        source: lead.source,
        lastRemarkBody: remark?.body ?? null,
        lastRemarkAt: remark?.createdAt ?? null,
        daysSinceContact: days,
        reminderId: r.reminderId,
        reminderDueAt: r.dueAt,
        reminderStatus: r.status,
        bucket,
        heat,
      };
    })
    .filter((r): r is RawRow => r !== null);

  return rows
    .sort((a, b) => {
      if (a.bucket === "overdue" && b.bucket !== "overdue") return -1;
      if (b.bucket === "overdue" && a.bucket !== "overdue") return 1;
      return a.reminderDueAt.getTime() - b.reminderDueAt.getTime();
    })
    .map((r): FollowUpRow => ({ ...r }));
}

export interface DashboardStats {
  leadsToday: number;
  overdue: number;
  dueToday: number;
  winRate7d: number;
}

export async function getDashboardStats(orgId: string, userId: string): Promise<DashboardStats> {
  const now = new Date();
  const sod = startOfDay(now);
  const eod = endOfDay(now);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

  const [leadsToday] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.orgId, orgId),
        eq(schema.leads.assigneeId, userId),
        gte(schema.leads.createdAt, sod),
      ),
    );

  const [overdue] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.reminders)
    .where(
      and(
        eq(schema.reminders.orgId, orgId),
        eq(schema.reminders.assigneeId, userId),
        eq(schema.reminders.status, "pending"),
        lte(schema.reminders.dueAt, sod),
      ),
    );

  const [dueToday] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.reminders)
    .where(
      and(
        eq(schema.reminders.orgId, orgId),
        eq(schema.reminders.assigneeId, userId),
        eq(schema.reminders.status, "pending"),
        gte(schema.reminders.dueAt, sod),
        lte(schema.reminders.dueAt, eod),
      ),
    );

  // Win rate over last 7 days: won / (won + lost) for this user's leads.
  const wonStage = db
    .select({ id: schema.pipelineStages.id })
    .from(schema.pipelineStages)
    .where(
      and(eq(schema.pipelineStages.orgId, orgId), eq(schema.pipelineStages.kind, "won")),
    );
  const lostStage = db
    .select({ id: schema.pipelineStages.id })
    .from(schema.pipelineStages)
    .where(
      and(eq(schema.pipelineStages.orgId, orgId), eq(schema.pipelineStages.kind, "lost")),
    );

  const [wonCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.orgId, orgId),
        eq(schema.leads.assigneeId, userId),
        sql`${schema.leads.stageId} IN (${wonStage})`,
        gte(schema.leads.updatedAt, sevenDaysAgo),
      ),
    );

  const [lostCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.orgId, orgId),
        eq(schema.leads.assigneeId, userId),
        sql`${schema.leads.stageId} IN (${lostStage})`,
        gte(schema.leads.updatedAt, sevenDaysAgo),
      ),
    );

  const decided = wonCount.count + lostCount.count;
  const winRate = decided > 0 ? Math.round((wonCount.count / decided) * 100) : 0;

  return {
    leadsToday: leadsToday.count,
    overdue: overdue.count,
    dueToday: dueToday.count,
    winRate7d: winRate,
  };
}
