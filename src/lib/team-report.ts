import "server-only";
import { and, eq, gte, lt, inArray, isNotNull, sql, type Column } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Team activity report — a per-member scorecard over a time window, plus
 * org-level highlights (wins, losses, inactive reps, quiet leads).
 * Shared by the daily/weekly admin emails and the /reports page.
 */

export interface MemberScorecard {
  userId: string;
  name: string;
  role: string;
  /** Leads currently assigned to this member (open stages only). */
  leadsAssigned: number;
  /** Leads created by this member within the window. */
  leadsCreated: number;
  /** Logged activities (call/email/meeting/note/visit) in window. */
  activitiesLogged: number;
  activityBreakdown: Record<string, number>;
  /** Remarks written in window. */
  remarksLogged: number;
  /** Follow-up reminders completed in window. */
  remindersDone: number;
  /** Pending reminders past due (snapshot, not windowed). */
  remindersOverdue: number;
  /** To-dos completed in window. */
  todosDone: number;
  /** Pipeline stage moves made by this member in window. */
  stageMoves: number;
  won: number;
  wonValue: number;
  lost: number;
  lostValue: number;
}

export interface QuietLead {
  leadId: string;
  leadName: string;
  repName: string;
  daysQuiet: number;
}

export interface TeamReport {
  window: { from: Date; to: Date };
  members: MemberScorecard[];
  totals: {
    newLeads: number;
    activitiesLogged: number;
    remarksLogged: number;
    stageMoves: number;
    won: number;
    wonValue: number;
    lost: number;
    lostValue: number;
    remindersDone: number;
    remindersOverdue: number;
  };
  highlights: {
    topWin: { leadName: string; value: number; repName: string } | null;
    lostDeals: { leadName: string; value: number; repName: string }[];
    /** Members with zero logged activities but who still own leads. */
    inactiveMembers: string[];
    quietLeads: QuietLead[];
  };
}

async function getOrgTimezone(orgId: string): Promise<string> {
  const [org] = await db
    .select({ timezone: schema.organizations.timezone })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1);
  return org?.timezone ?? "Africa/Lagos";
}

const QUIET_DAYS = 7;

export async function getTeamReport(
  orgId: string,
  window: { from: Date; to: Date },
): Promise<TeamReport> {
  const { from, to } = window;
  const now = new Date();
  const quietBefore = new Date(now.getTime() - QUIET_DAYS * 24 * 60 * 60 * 1000);

  const members = await db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      role: schema.memberships.role,
      suspendedAt: schema.users.suspendedAt,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.orgId, orgId));
  const activeMembers = members.filter((m) => !m.suspendedAt);

  const stages = await db
    .select({ id: schema.pipelineStages.id, kind: schema.pipelineStages.kind })
    .from(schema.pipelineStages)
    .where(eq(schema.pipelineStages.orgId, orgId));
  const openIds = stages.filter((s) => s.kind === "open").map((s) => s.id);

  const inWindow = (col: Column) => and(gte(col, from), lt(col, to));

  // ── Batched per-member counts (one GROUP BY each, keyed by user) ──

  const assignedRows = openIds.length
    ? await db
        .select({ assigneeId: schema.leads.assigneeId, n: sql<number>`count(*)::int` })
        .from(schema.leads)
        .where(and(eq(schema.leads.orgId, orgId), inArray(schema.leads.stageId, openIds)))
        .groupBy(schema.leads.assigneeId)
    : [];
  const assignedMap = new Map(assignedRows.map((r) => [r.assigneeId, r.n]));

  const createdRows = await db
    .select({ createdById: schema.leads.createdById, n: sql<number>`count(*)::int` })
    .from(schema.leads)
    .where(and(eq(schema.leads.orgId, orgId), inWindow(schema.leads.createdAt)))
    .groupBy(schema.leads.createdById);
  const createdMap = new Map(createdRows.map((r) => [r.createdById, r.n]));

  const activityRows = await db
    .select({
      authorId: schema.activities.authorId,
      type: schema.activities.type,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.activities)
    .where(and(eq(schema.activities.orgId, orgId), inWindow(schema.activities.occurredAt)))
    .groupBy(schema.activities.authorId, schema.activities.type);

  const remarkRows = await db
    .select({ authorId: schema.remarks.authorId, n: sql<number>`count(*)::int` })
    .from(schema.remarks)
    .where(and(eq(schema.remarks.orgId, orgId), inWindow(schema.remarks.createdAt)))
    .groupBy(schema.remarks.authorId);
  const remarkMap = new Map(remarkRows.map((r) => [r.authorId, r.n]));

  const remindersDoneRows = await db
    .select({ assigneeId: schema.reminders.assigneeId, n: sql<number>`count(*)::int` })
    .from(schema.reminders)
    .where(
      and(
        eq(schema.reminders.orgId, orgId),
        eq(schema.reminders.status, "completed"),
        inWindow(schema.reminders.updatedAt),
      ),
    )
    .groupBy(schema.reminders.assigneeId);
  const remindersDoneMap = new Map(remindersDoneRows.map((r) => [r.assigneeId, r.n]));

  const overdueRows = await db
    .select({ assigneeId: schema.reminders.assigneeId, n: sql<number>`count(*)::int` })
    .from(schema.reminders)
    .where(
      and(
        eq(schema.reminders.orgId, orgId),
        eq(schema.reminders.status, "pending"),
        lt(schema.reminders.dueAt, now),
      ),
    )
    .groupBy(schema.reminders.assigneeId);
  const overdueMap = new Map(overdueRows.map((r) => [r.assigneeId, r.n]));

  const todosDoneRows = await db
    .select({ userId: schema.todos.userId, n: sql<number>`count(*)::int` })
    .from(schema.todos)
    .where(
      and(
        eq(schema.todos.orgId, orgId),
        eq(schema.todos.status, "completed"),
        inWindow(schema.todos.updatedAt),
      ),
    )
    .groupBy(schema.todos.userId);
  const todosDoneMap = new Map(todosDoneRows.map((r) => [r.userId, r.n]));

  const stageMoveRows = await db
    .select({ actorId: schema.auditEvents.actorId, n: sql<number>`count(*)::int` })
    .from(schema.auditEvents)
    .where(
      and(
        eq(schema.auditEvents.orgId, orgId),
        eq(schema.auditEvents.type, "stage_changed"),
        inWindow(schema.auditEvents.createdAt),
      ),
    )
    .groupBy(schema.auditEvents.actorId);
  const stageMoveMap = new Map(stageMoveRows.map((r) => [r.actorId, r.n]));

  const wonRows = await db
    .select({
      assigneeId: schema.leads.assigneeId,
      n: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${schema.leads.value}::numeric), 0)::float`,
    })
    .from(schema.leads)
    .where(and(eq(schema.leads.orgId, orgId), inWindow(schema.leads.wonAt)))
    .groupBy(schema.leads.assigneeId);
  const wonMap = new Map(wonRows.map((r) => [r.assigneeId, r]));

  const lostRows = await db
    .select({
      assigneeId: schema.leads.assigneeId,
      n: sql<number>`count(*)::int`,
      total: sql<number>`coalesce(sum(${schema.leads.value}::numeric), 0)::float`,
    })
    .from(schema.leads)
    .where(and(eq(schema.leads.orgId, orgId), inWindow(schema.leads.lostAt)))
    .groupBy(schema.leads.assigneeId);
  const lostMap = new Map(lostRows.map((r) => [r.assigneeId, r]));

  // ── Highlights ──

  const [topWin] = await db
    .select({
      name: schema.leads.name,
      value: schema.leads.value,
      repName: schema.users.name,
    })
    .from(schema.leads)
    .leftJoin(schema.users, eq(schema.leads.assigneeId, schema.users.id))
    .where(
      and(
        eq(schema.leads.orgId, orgId),
        inWindow(schema.leads.wonAt),
        isNotNull(schema.leads.value),
      ),
    )
    .orderBy(sql`${schema.leads.value}::numeric DESC NULLS LAST`)
    .limit(1);

  const lostDeals = await db
    .select({
      name: schema.leads.name,
      value: schema.leads.value,
      repName: schema.users.name,
    })
    .from(schema.leads)
    .leftJoin(schema.users, eq(schema.leads.assigneeId, schema.users.id))
    .where(and(eq(schema.leads.orgId, orgId), inWindow(schema.leads.lostAt)))
    .orderBy(sql`${schema.leads.value}::numeric DESC NULLS LAST`)
    .limit(5);

  // Quiet leads: open leads untouched (no activity or remark) in 7+ days.
  const openLeadRows = openIds.length
    ? await db
        .select({
          id: schema.leads.id,
          name: schema.leads.name,
          assigneeId: schema.leads.assigneeId,
          updatedAt: schema.leads.updatedAt,
        })
        .from(schema.leads)
        .where(and(eq(schema.leads.orgId, orgId), inArray(schema.leads.stageId, openIds), isNotNull(schema.leads.assigneeId)))
    : [];

  const touchedActivity = await db
    .select({ leadId: schema.activities.leadId })
    .from(schema.activities)
    .where(and(eq(schema.activities.orgId, orgId), gte(schema.activities.occurredAt, quietBefore)))
    .groupBy(schema.activities.leadId);
  const touchedRemarks = await db
    .select({ leadId: schema.remarks.leadId })
    .from(schema.remarks)
    .where(and(eq(schema.remarks.orgId, orgId), gte(schema.remarks.createdAt, quietBefore)))
    .groupBy(schema.remarks.leadId);
  const touched = new Set([...touchedActivity.map((r) => r.leadId), ...touchedRemarks.map((r) => r.leadId)]);
  // Leads created recently aren't "quiet" yet even with no logged touch.
  const nameById = new Map(activeMembers.map((m) => [m.userId, m.name]));

  const quietLeads: QuietLead[] = openLeadRows
    .filter((l) => !touched.has(l.id) && l.updatedAt < quietBefore)
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())
    .slice(0, 5)
    .map((l) => ({
      leadId: l.id,
      leadName: l.name,
      repName: nameById.get(l.assigneeId!) ?? "Unassigned",
      daysQuiet: Math.floor((now.getTime() - l.updatedAt.getTime()) / (24 * 60 * 60 * 1000)),
    }));

  // ── Assemble scorecards ──

  const scorecards: MemberScorecard[] = activeMembers.map((m) => {
    const breakdown: Record<string, number> = {};
    let actTotal = 0;
    for (const r of activityRows) {
      if (r.authorId !== m.userId) continue;
      breakdown[r.type] = (breakdown[r.type] ?? 0) + r.n;
      actTotal += r.n;
    }
    const won = wonMap.get(m.userId);
    const lost = lostMap.get(m.userId);
    return {
      userId: m.userId,
      name: m.name,
      role: m.role,
      leadsAssigned: assignedMap.get(m.userId) ?? 0,
      leadsCreated: createdMap.get(m.userId) ?? 0,
      activitiesLogged: actTotal,
      activityBreakdown: breakdown,
      remarksLogged: remarkMap.get(m.userId) ?? 0,
      remindersDone: remindersDoneMap.get(m.userId) ?? 0,
      remindersOverdue: overdueMap.get(m.userId) ?? 0,
      todosDone: todosDoneMap.get(m.userId) ?? 0,
      stageMoves: stageMoveMap.get(m.userId) ?? 0,
      won: won?.n ?? 0,
      wonValue: won?.total ?? 0,
      lost: lost?.n ?? 0,
      lostValue: lost?.total ?? 0,
    };
  });

  const inactiveMembers = scorecards
    .filter((m) => m.activitiesLogged === 0 && m.leadsAssigned > 0)
    .map((m) => m.name);

  const totals = scorecards.reduce(
    (acc, m) => ({
      newLeads: acc.newLeads + m.leadsCreated,
      activitiesLogged: acc.activitiesLogged + m.activitiesLogged,
      remarksLogged: acc.remarksLogged + m.remarksLogged,
      stageMoves: acc.stageMoves + m.stageMoves,
      won: acc.won + m.won,
      wonValue: acc.wonValue + m.wonValue,
      lost: acc.lost + m.lost,
      lostValue: acc.lostValue + m.lostValue,
      remindersDone: acc.remindersDone + m.remindersDone,
      remindersOverdue: acc.remindersOverdue + m.remindersOverdue,
    }),
    {
      newLeads: 0,
      activitiesLogged: 0,
      remarksLogged: 0,
      stageMoves: 0,
      won: 0,
      wonValue: 0,
      lost: 0,
      lostValue: 0,
      remindersDone: 0,
      remindersOverdue: 0,
    },
  );

  return {
    window: { from, to },
    members: scorecards,
    totals,
    highlights: {
      topWin: topWin
        ? { leadName: topWin.name, value: topWin.value ? parseFloat(topWin.value) : 0, repName: topWin.repName ?? "—" }
        : null,
      lostDeals: lostDeals.map((d) => ({
        leadName: d.name,
        value: d.value ? parseFloat(d.value) : 0,
        repName: d.repName ?? "—",
      })),
      inactiveMembers,
      quietLeads,
    },
  };
}

/**
 * Activity feed — recent audit events in the window, with actor + lead names.
 * Powers the "logs" section of the team activity panel.
 */
export interface FeedItem {
  id: string;
  at: Date;
  actorName: string;
  type: string;
  leadId: string | null;
  leadName: string | null;
  meta: Record<string, unknown> | null;
}

export async function getActivityFeed(
  orgId: string,
  window: { from: Date; to: Date },
  memberId?: string,
  limit = 60,
): Promise<FeedItem[]> {
  const rows = await db
    .select({
      id: schema.auditEvents.id,
      at: schema.auditEvents.createdAt,
      type: schema.auditEvents.type,
      leadId: schema.auditEvents.leadId,
      meta: schema.auditEvents.meta,
      actorName: schema.users.name,
      leadName: schema.leads.name,
    })
    .from(schema.auditEvents)
    .leftJoin(schema.users, eq(schema.auditEvents.actorId, schema.users.id))
    .leftJoin(schema.leads, eq(schema.auditEvents.leadId, schema.leads.id))
    .where(
      and(
        eq(schema.auditEvents.orgId, orgId),
        inWindowAudit(schema.auditEvents.createdAt, window),
        memberId ? eq(schema.auditEvents.actorId, memberId) : undefined,
      ),
    )
    .orderBy(sql`${schema.auditEvents.createdAt} DESC`)
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    actorName: r.actorName ?? "System",
    type: r.type,
    leadId: r.leadId,
    leadName: r.leadName,
    meta: (r.meta ?? null) as Record<string, unknown> | null,
  }));
}

function inWindowAudit(col: Column, window: { from: Date; to: Date }) {
  return and(gte(col, window.from), lt(col, window.to));
}

/** Human-readable label + icon for each audit event type in the feed. */
export const EVENT_LABELS: Record<string, string> = {
  lead_created: "added a lead",
  lead_updated: "updated a lead",
  lead_deleted: "deleted a lead",
  remark_added: "logged a remark on",
  activity_logged: "logged an activity on",
  reminder_set: "set a follow-up on",
  reminder_completed: "completed a follow-up on",
  reminder_snoozed: "snoozed a follow-up on",
  reminder_deleted: "deleted a follow-up on",
  stage_changed: "moved",
  lead_assigned: "was assigned",
  lead_won: "won",
  lead_lost: "lost",
  todo_created: "created a to-do",
  todo_completed: "completed a to-do",
  note_created: "wrote a note",
  document_uploaded: "uploaded a document to",
  sequence_enrolled: "enrolled a lead in a sequence:",
  sequence_step_sent: "sequence step sent to",
  sequence_completed: "completed a sequence:",
  member_invited: "invited a member",
  member_joined: "joined the workspace",
  role_changed: "changed a role",
  member_removed: "removed a member",
};

export { getOrgTimezone };
