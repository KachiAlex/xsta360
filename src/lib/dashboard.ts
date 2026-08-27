import "server-only";
import { and, asc, desc, eq, gte, lte, sql, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UrgencyBucket = "overdue" | "today" | "upcoming" | "quiet";
export type Heat = "hot" | "warm" | "cold";

export interface TimelineEntry {
  id: string;
  type: string; // activity type or "remark" or "stage_changed" etc.
  body: string | null;
  occurredAt: Date;
  authorName: string | null;
}

export interface PulseLead {
  leadId: string;
  leadName: string;
  company: string | null;
  source: string;
  stageName: string | null;
  stageKind: string | null;
  heat: Heat;
  bucket: UrgencyBucket;
  // Latest activity (for collapsed card preview).
  lastActivityBody: string | null;
  lastActivityType: string | null;
  lastActivityAt: Date | null;
  daysSinceContact: number | null;
  // Next pending reminder (if any).
  reminderId: string | null;
  reminderDueAt: Date | null;
  reminderNote: string | null;
  // Deal value + score.
  value: string | null;
  score: number;
  phone: string | null;
  // Full timeline (loaded on expand).
  timeline: TimelineEntry[];
}

export interface DashboardStats {
  leadsToday: number;
  overdue: number;
  dueToday: number;
  winRate7d: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Get all assigned leads grouped by urgency bucket
// ---------------------------------------------------------------------------

export async function getPulseLeads(orgId: string, userId: string): Promise<{
  overdue: PulseLead[];
  today: PulseLead[];
  upcoming: PulseLead[];
  quiet: PulseLead[];
}> {
  const now = new Date();
  const sod = startOfDay(now);
  const eod = endOfDay(now);
  const sevenDaysAhead = new Date(now.getTime() + 7 * 86_400_000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);

  // Load all open-stage leads assigned to the user.
  const leads = await db
    .select({
      id: schema.leads.id,
      name: schema.leads.name,
      company: schema.leads.company,
      source: schema.leads.source,
      stageId: schema.leads.stageId,
      createdAt: schema.leads.createdAt,
      value: schema.leads.value,
      score: schema.leads.score,
      phone: schema.leads.phone,
    })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.orgId, orgId),
        eq(schema.leads.assigneeId, userId),
      ),
    );

  if (leads.length === 0) {
    return { overdue: [], today: [], upcoming: [], quiet: [] };
  }

  const leadIds = leads.map((l) => l.id);

  // Load stage names for these leads.
  const stages = await db
    .select({ id: schema.pipelineStages.id, name: schema.pipelineStages.name, kind: schema.pipelineStages.kind })
    .from(schema.pipelineStages)
    .where(eq(schema.pipelineStages.orgId, orgId));
  const stageMap = new Map(stages.map((s) => [s.id, s]));

  // Filter to only open-stage leads (won/lost leads don't need follow-ups).
  const openLeads = leads.filter((l) => {
    const stage = l.stageId ? stageMap.get(l.stageId) : null;
    return !stage || stage.kind === "open";
  });

  if (openLeads.length === 0) {
    return { overdue: [], today: [], upcoming: [], quiet: [] };
  }

  const openLeadIds = openLeads.map((l) => l.id);

  // Load ALL pending reminders for these leads.
  const allReminders = await db
    .select({
      id: schema.reminders.id,
      leadId: schema.reminders.leadId,
      dueAt: schema.reminders.dueAt,
      note: schema.reminders.note,
      status: schema.reminders.status,
    })
    .from(schema.reminders)
    .where(
      and(
        eq(schema.reminders.orgId, orgId),
        inArray(schema.reminders.leadId, openLeadIds),
        eq(schema.reminders.status, "pending"),
      ),
    )
    .orderBy(asc(schema.reminders.dueAt));

  // Index next reminder per lead (earliest pending).
  const nextReminder = new Map<string, { id: string; dueAt: Date; note: string | null }>();
  for (const r of allReminders) {
    if (!nextReminder.has(r.leadId)) {
      nextReminder.set(r.leadId, { id: r.id, dueAt: r.dueAt, note: r.note });
    }
  }

  // Load latest activity per lead (activities + remarks, unified).
  const activities = await db
    .select({
      leadId: schema.activities.leadId,
      body: schema.activities.body,
      type: schema.activities.type,
      occurredAt: schema.activities.occurredAt,
    })
    .from(schema.activities)
    .where(
      and(
        eq(schema.activities.orgId, orgId),
        inArray(schema.activities.leadId, openLeadIds),
      ),
    )
    .orderBy(desc(schema.activities.occurredAt));

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
        inArray(schema.remarks.leadId, openLeadIds),
      ),
    )
    .orderBy(desc(schema.remarks.createdAt));

  // Build latest-activity map (activities take priority, then remarks).
  type LatestAct = { body: string; type: string; at: Date };
  const latestActivity = new Map<string, LatestAct>();

  for (const a of activities) {
    if (!latestActivity.has(a.leadId)) {
      latestActivity.set(a.leadId, { body: a.body, type: a.type, at: a.occurredAt });
    }
  }
  for (const r of remarks) {
    if (!latestActivity.has(r.leadId)) {
      latestActivity.set(r.leadId, { body: r.body, type: "remark", at: r.createdAt });
    }
  }

  // Bucket each lead.
  const result: { overdue: PulseLead[]; today: PulseLead[]; upcoming: PulseLead[]; quiet: PulseLead[] } = {
    overdue: [],
    today: [],
    upcoming: [],
    quiet: [],
  };

  for (const lead of openLeads) {
    const reminder = nextReminder.get(lead.id);
    const activity = latestActivity.get(lead.id);
    const daysSince = activity ? daysBetween(activity.at, now) : daysBetween(lead.createdAt, now);

    let bucket: UrgencyBucket;
    if (reminder && reminder.dueAt < sod) {
      bucket = "overdue";
    } else if (reminder && reminder.dueAt >= sod && reminder.dueAt <= eod) {
      bucket = "today";
    } else if (reminder && reminder.dueAt > eod && reminder.dueAt <= sevenDaysAhead) {
      bucket = "upcoming";
    } else if (!activity && daysSince > 7 || (activity && daysSince > 7)) {
      bucket = "quiet";
    } else if (reminder && reminder.dueAt > sevenDaysAhead) {
      bucket = "quiet";
    } else {
      // No reminder and recent activity — still show in upcoming if < 7 days quiet.
      bucket = daysSince > 3 ? "quiet" : "upcoming";
    }

    const heat: Heat =
      bucket === "overdue" ? "cold" : daysSince <= 1 ? "hot" : daysSince <= 4 ? "warm" : "cold";

    const stage = lead.stageId ? stageMap.get(lead.stageId) : null;

    result[bucket].push({
      leadId: lead.id,
      leadName: lead.name,
      company: lead.company,
      source: lead.source,
      stageName: stage?.name ?? null,
      stageKind: stage?.kind ?? null,
      heat,
      bucket,
      lastActivityBody: activity?.body ?? null,
      lastActivityType: activity?.type ?? null,
      lastActivityAt: activity?.at ?? null,
      daysSinceContact: daysSince,
      reminderId: reminder?.id ?? null,
      reminderDueAt: reminder?.dueAt ?? null,
      reminderNote: reminder?.note ?? null,
      value: lead.value,
      score: lead.score,
      phone: lead.phone,
      timeline: [], // loaded on expand
    });
  }

  // Sort each bucket.
  const sortByDue = (a: PulseLead, b: PulseLead) =>
    (a.reminderDueAt?.getTime() ?? Infinity) - (b.reminderDueAt?.getTime() ?? Infinity);
  const sortByDays = (a: PulseLead, b: PulseLead) =>
    (b.daysSinceContact ?? 0) - (a.daysSinceContact ?? 0);

  result.overdue.sort(sortByDue);
  result.today.sort(sortByDue);
  result.upcoming.sort(sortByDue);
  result.quiet.sort(sortByDays);

  return result;
}

// ---------------------------------------------------------------------------
// Get timeline for a single lead (activities + remarks + stage changes)
// ---------------------------------------------------------------------------

export async function getLeadTimeline(orgId: string, leadId: string): Promise<TimelineEntry[]> {
  // Load activities.
  const activities = await db
    .select({
      id: schema.activities.id,
      leadId: schema.activities.leadId,
      body: schema.activities.body,
      type: schema.activities.type,
      occurredAt: schema.activities.occurredAt,
      authorName: schema.users.name,
    })
    .from(schema.activities)
    .leftJoin(schema.users, eq(schema.users.id, schema.activities.authorId))
    .where(
      and(
        eq(schema.activities.orgId, orgId),
        eq(schema.activities.leadId, leadId),
      ),
    )
    .orderBy(desc(schema.activities.occurredAt));

  // Load remarks (legacy).
  const remarks = await db
    .select({
      id: schema.remarks.id,
      leadId: schema.remarks.leadId,
      body: schema.remarks.body,
      createdAt: schema.remarks.createdAt,
      authorName: schema.users.name,
    })
    .from(schema.remarks)
    .leftJoin(schema.users, eq(schema.users.id, schema.remarks.authorId))
    .where(
      and(
        eq(schema.remarks.orgId, orgId),
        eq(schema.remarks.leadId, leadId),
      ),
    )
    .orderBy(desc(schema.remarks.createdAt));

  // Load audit events for stage changes / lead creation.
  const auditEvents = await db
    .select({
      id: schema.auditEvents.id,
      type: schema.auditEvents.type,
      meta: schema.auditEvents.meta,
      createdAt: schema.auditEvents.createdAt,
      actorName: schema.users.name,
    })
    .from(schema.auditEvents)
    .leftJoin(schema.users, eq(schema.users.id, schema.auditEvents.actorId))
    .where(
      and(
        eq(schema.auditEvents.orgId, orgId),
        eq(schema.auditEvents.leadId, leadId),
        inArray(schema.auditEvents.type, ["lead_created", "stage_changed", "lead_won", "lead_lost", "lead_assigned"]),
      ),
    )
    .orderBy(desc(schema.auditEvents.createdAt));

  // Merge into unified timeline.
  const timeline: TimelineEntry[] = [
    ...activities.map((a) => ({
      id: a.id,
      type: a.type,
      body: a.body,
      occurredAt: a.occurredAt,
      authorName: a.authorName,
    })),
    ...remarks.map((r) => ({
      id: r.id,
      type: "remark",
      body: r.body,
      occurredAt: r.createdAt,
      authorName: r.authorName,
    })),
    ...auditEvents.map((e) => {
      const meta = (e.meta ?? {}) as Record<string, string | undefined>;
      return {
        id: e.id,
        type: e.type,
        body: e.type === "lead_created"
          ? "Lead created"
          : e.type === "stage_changed"
            ? `Moved to ${meta.toStageName ?? "new stage"}`
            : e.type === "lead_won"
              ? "Deal won"
              : e.type === "lead_lost"
                ? `Lost: ${meta.lostReasonText ?? "reason not specified"}`
                : e.type === "lead_assigned"
                  ? "Lead reassigned"
                  : e.type,
        occurredAt: e.createdAt,
        authorName: e.actorName,
      };
    }),
  ];

  // Sort by occurredAt descending.
  timeline.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  return timeline;
}

// ---------------------------------------------------------------------------
// Dashboard stats (unchanged)
// ---------------------------------------------------------------------------

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

  // Win rate over last 7 days.
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

// ---------------------------------------------------------------------------
// Upcoming reminders list (for the reminders panel on the dashboard)
// ---------------------------------------------------------------------------

export interface ReminderRow {
  id: string;
  leadId: string;
  leadName: string;
  leadCompany: string | null;
  leadPhone: string | null;
  dueAt: Date;
  note: string | null;
  status: string;
  bucket: "overdue" | "today" | "upcoming";
}

export async function getUpcomingReminders(orgId: string, userId: string): Promise<{
  overdue: ReminderRow[];
  today: ReminderRow[];
  upcoming: ReminderRow[];
}> {
  const now = new Date();
  const sod = startOfDay(now);
  const eod = endOfDay(now);
  const fourteenDaysAhead = new Date(now.getTime() + 14 * 86_400_000);

  const reminders = await db
    .select({
      id: schema.reminders.id,
      leadId: schema.reminders.leadId,
      leadName: schema.leads.name,
      leadCompany: schema.leads.company,
      leadPhone: schema.leads.phone,
      dueAt: schema.reminders.dueAt,
      note: schema.reminders.note,
      status: schema.reminders.status,
    })
    .from(schema.reminders)
    .innerJoin(schema.leads, eq(schema.reminders.leadId, schema.leads.id))
    .where(
      and(
        eq(schema.reminders.orgId, orgId),
        eq(schema.reminders.assigneeId, userId),
        eq(schema.reminders.status, "pending"),
        lte(schema.reminders.dueAt, fourteenDaysAhead),
      ),
    )
    .orderBy(asc(schema.reminders.dueAt));

  const result: { overdue: ReminderRow[]; today: ReminderRow[]; upcoming: ReminderRow[] } = {
    overdue: [],
    today: [],
    upcoming: [],
  };

  for (const r of reminders) {
    const bucket: "overdue" | "today" | "upcoming" =
      r.dueAt < sod ? "overdue" : r.dueAt <= eod ? "today" : "upcoming";
    result[bucket].push({
      id: r.id,
      leadId: r.leadId,
      leadName: r.leadName,
      leadCompany: r.leadCompany,
      leadPhone: r.leadPhone,
      dueAt: r.dueAt,
      note: r.note,
      status: r.status,
      bucket,
    });
  }

  return result;
}
