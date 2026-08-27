import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Lead scoring algorithm (0-100).
 *
 * Factors:
 * - Stage progression: later stages = higher score
 * - Activity recency: recent activity = higher score
 * - Activity frequency: more activities = higher score
 * - Source quality: referrals > social > ad > walk_in > embedded > other
 * - Deal value: higher value = higher score (capped)
 * - Has contact info: email + phone = bonus
 * - Response time: quickly contacted after creation = bonus
 */

const SOURCE_SCORES: Record<string, number> = {
  referral: 20,
  social: 12,
  ad: 10,
  walk_in: 15,
  embedded_form: 8,
  other: 5,
};

interface ScoreInput {
  leadId: string;
  stageProbability: number;
  source: string;
  value: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  createdAt: Date;
  activityCount: number;
  lastActivityAt: Date | null;
  daysSinceCreation: number;
}

export function computeScore(input: ScoreInput): number {
  let score = 0;

  // Stage progression (0-30)
  score += Math.round((input.stageProbability / 100) * 30);

  // Source quality (0-20)
  score += SOURCE_SCORES[input.source] ?? 5;

  // Activity recency (0-20)
  if (input.lastActivityAt) {
    const daysSinceActivity = Math.floor(
      (Date.now() - input.lastActivityAt.getTime()) / 86_400_000,
    );
    if (daysSinceActivity <= 1) score += 20;
    else if (daysSinceActivity <= 3) score += 15;
    else if (daysSinceActivity <= 7) score += 10;
    else if (daysSinceActivity <= 14) score += 5;
  }

  // Activity frequency (0-10)
  if (input.activityCount >= 5) score += 10;
  else if (input.activityCount >= 3) score += 7;
    else if (input.activityCount >= 1) score += 4;

  // Deal value (0-10)
  if (input.value) {
    const val = parseFloat(input.value);
    if (!isNaN(val) && val > 0) {
      if (val >= 1_000_000) score += 10;
      else if (val >= 100_000) score += 7;
      else if (val >= 10_000) score += 5;
      else score += 3;
    }
  }

  // Contact info bonus (0-5)
  if (input.hasEmail && input.hasPhone) score += 5;
  else if (input.hasEmail || input.hasPhone) score += 2;

  // Response speed bonus (0-5): contacted within 1 day of creation
  if (input.lastActivityAt) {
    const hoursToFirstContact =
      (input.lastActivityAt.getTime() - input.createdAt.getTime()) / 3_600_000;
    if (hoursToFirstContact <= 24) score += 5;
    else if (hoursToFirstContact <= 72) score += 2;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Recompute and persist scores for all open leads in an org.
 * Called by a cron job or after activity logging.
 */
export async function recomputeOrgLeadScores(orgId: string): Promise<number> {
  // Load all open-stage leads.
  const stages = await db
    .select({ id: schema.pipelineStages.id, probability: schema.pipelineStages.probability, kind: schema.pipelineStages.kind })
    .from(schema.pipelineStages)
    .where(eq(schema.pipelineStages.orgId, orgId));

  const stageMap = new Map(stages.map((s) => [s.id, s]));
  const openStageIds = stages.filter((s) => s.kind === "open").map((s) => s.id);

  if (openStageIds.length === 0) return 0;

  const leads = await db
    .select()
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.orgId, orgId),
        inArray(schema.leads.stageId, openStageIds),
      ),
    );

  if (leads.length === 0) return 0;

  const leadIds = leads.map((l) => l.id);

  // Count activities per lead.
  const activityCounts = await db
    .select({
      leadId: schema.activities.leadId,
      count: schema.activities.id,
    })
    .from(schema.activities)
    .where(
      and(eq(schema.activities.orgId, orgId), inArray(schema.activities.leadId, leadIds)),
    )
    .orderBy(desc(schema.activities.occurredAt));

  const activityMap = new Map<string, { count: number; lastAt: Date }>();
  for (const a of activityCounts) {
    const existing = activityMap.get(a.leadId);
    if (existing) {
      existing.count++;
    } else {
      activityMap.set(a.leadId, { count: 1, lastAt: new Date() });
    }
  }

  // Also check remarks for older leads.
  const remarks = await db
    .select({ leadId: schema.remarks.leadId, createdAt: schema.remarks.createdAt })
    .from(schema.remarks)
    .where(
      and(eq(schema.remarks.orgId, orgId), inArray(schema.remarks.leadId, leadIds)),
    )
    .orderBy(desc(schema.remarks.createdAt));

  for (const r of remarks) {
    const existing = activityMap.get(r.leadId);
    if (existing) {
      existing.count++;
      if (r.createdAt > existing.lastAt) existing.lastAt = r.createdAt;
    } else {
      activityMap.set(r.leadId, { count: 1, lastAt: r.createdAt });
    }
  }

  const now = new Date();
  let updated = 0;

  for (const lead of leads) {
    const stage = lead.stageId ? stageMap.get(lead.stageId) : null;
    const activity = activityMap.get(lead.id);
    const daysSinceCreation = Math.floor((now.getTime() - lead.createdAt.getTime()) / 86_400_000);

    const score = computeScore({
      leadId: lead.id,
      stageProbability: stage?.probability ?? 0,
      source: lead.source,
      value: lead.value,
      hasEmail: !!lead.email,
      hasPhone: !!lead.phone,
      createdAt: lead.createdAt,
      activityCount: activity?.count ?? 0,
      lastActivityAt: activity?.lastAt ?? null,
      daysSinceCreation,
    });

    if (lead.score !== score) {
      await db
        .update(schema.leads)
        .set({ score, updatedAt: now })
        .where(eq(schema.leads.id, lead.id));
      updated++;
    }
  }

  return updated;
}
