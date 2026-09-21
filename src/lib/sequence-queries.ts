import "server-only";
import { and, asc, eq, inArray, count } from "drizzle-orm";
import { db, schema } from "@/db";

export interface SequenceWithSteps {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sendWindowStart: string | null;
  sendWindowEnd: string | null;
  skipWeekends: boolean;
  timezone: string;
  steps: {
    id: string;
    position: number;
    delayDays: number;
    action: string;
    subject: string | null;
    body: string;
    senderName: string | null;
    attachments: string[];
    variantBSubject: string | null;
    variantBBody: string | null;
    variantBSenderName: string | null;
  }[];
  enrollmentCount: number;
}

export async function getOrgSequences(orgId: string): Promise<SequenceWithSteps[]> {
  const sequences = await db
    .select()
    .from(schema.sequences)
    .where(eq(schema.sequences.orgId, orgId))
    .orderBy(asc(schema.sequences.createdAt));

  if (sequences.length === 0) return [];

  const seqIds = sequences.map((s) => s.id);

  const steps = await db
    .select()
    .from(schema.sequenceSteps)
    .where(and(eq(schema.sequenceSteps.orgId, orgId)))
    .orderBy(asc(schema.sequenceSteps.position));

  const enrollments = await db
    .select({ sequenceId: schema.sequenceEnrollments.sequenceId })
    .from(schema.sequenceEnrollments)
    .where(
      and(
        eq(schema.sequenceEnrollments.orgId, orgId),
        eq(schema.sequenceEnrollments.status, "active"),
      ),
    );

  const enrollmentCounts = new Map<string, number>();
  for (const e of enrollments) {
    enrollmentCounts.set(e.sequenceId, (enrollmentCounts.get(e.sequenceId) ?? 0) + 1);
  }

  return sequences.map((seq) => ({
    id: seq.id,
    name: seq.name,
    description: seq.description,
    active: seq.active,
    sendWindowStart: seq.sendWindowStart,
    sendWindowEnd: seq.sendWindowEnd,
    skipWeekends: seq.skipWeekends,
    timezone: seq.timezone,
    steps: steps
      .filter((s) => s.sequenceId === seq.id)
      .map((s) => ({
        id: s.id,
        position: s.position,
        delayDays: s.delayDays,
        action: s.action,
        subject: s.subject,
        body: s.body,
        senderName: s.senderName,
        attachments: (s.attachments as string[]) ?? [],
        variantBSubject: s.variantBSubject,
        variantBBody: s.variantBBody,
        variantBSenderName: s.variantBSenderName,
      })),
    enrollmentCount: enrollmentCounts.get(seq.id) ?? 0,
  }));
}

export interface LeadEnrollment {
  enrollmentId: string;
  sequenceId: string;
  sequenceName: string;
  status: string;
  currentStep: number;
  totalSteps: number;
  enrolledAt: Date;
  completedAt: Date | null;
  pausedReason: string | null;
  repliedAt: Date | null;
  bouncedAt: Date | null;
}

/**
 * Get all sequence enrollments for a specific lead.
 */
export async function getLeadEnrollments(orgId: string, leadId: string): Promise<LeadEnrollment[]> {
  const enrollments = await db
    .select({
      enrollmentId: schema.sequenceEnrollments.id,
      sequenceId: schema.sequenceEnrollments.sequenceId,
      sequenceName: schema.sequences.name,
      status: schema.sequenceEnrollments.status,
      currentStep: schema.sequenceEnrollments.currentStep,
      enrolledAt: schema.sequenceEnrollments.enrolledAt,
      completedAt: schema.sequenceEnrollments.completedAt,
      pausedReason: schema.sequenceEnrollments.pausedReason,
      repliedAt: schema.sequenceEnrollments.repliedAt,
      bouncedAt: schema.sequenceEnrollments.bouncedAt,
    })
    .from(schema.sequenceEnrollments)
    .leftJoin(schema.sequences, eq(schema.sequenceEnrollments.sequenceId, schema.sequences.id))
    .where(
      and(
        eq(schema.sequenceEnrollments.orgId, orgId),
        eq(schema.sequenceEnrollments.leadId, leadId),
      ),
    )
    .orderBy(asc(schema.sequenceEnrollments.enrolledAt));

  // Fetch step counts per sequence in a single GROUP BY query.
  const sequenceIds = [...new Set(enrollments.map((e) => e.sequenceId))];
  const stepCounts = new Map<string, number>();
  if (sequenceIds.length > 0) {
    const stepCountRows = await db
      .select({
        sequenceId: schema.sequenceSteps.sequenceId,
        count: count(),
      })
      .from(schema.sequenceSteps)
      .where(inArray(schema.sequenceSteps.sequenceId, sequenceIds))
      .groupBy(schema.sequenceSteps.sequenceId);
    for (const r of stepCountRows) {
      stepCounts.set(r.sequenceId, r.count);
    }
  }

  return enrollments.map((e) => ({
    enrollmentId: e.enrollmentId,
    sequenceId: e.sequenceId,
    sequenceName: e.sequenceName ?? "Unknown",
    status: e.status,
    currentStep: e.currentStep,
    totalSteps: stepCounts.get(e.sequenceId) ?? 0,
    enrolledAt: e.enrolledAt,
    completedAt: e.completedAt,
    pausedReason: e.pausedReason,
    repliedAt: e.repliedAt,
    bouncedAt: e.bouncedAt,
  }));
}

export interface SequenceEnrollmentRow {
  enrollmentId: string;
  sequenceId: string;
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  leadEmail: string | null;
  status: string;
  currentStep: number;
  enrolledAt: Date;
}

/**
 * Get all enrollments across an org's sequences, joined to lead info.
 * Used by the sequences page to show who is enrolled in each sequence.
 */
export async function getOrgSequenceEnrollments(orgId: string): Promise<SequenceEnrollmentRow[]> {
  return db
    .select({
      enrollmentId: schema.sequenceEnrollments.id,
      sequenceId: schema.sequenceEnrollments.sequenceId,
      leadId: schema.sequenceEnrollments.leadId,
      leadName: schema.leads.name,
      leadPhone: schema.leads.phone,
      leadEmail: schema.leads.email,
      status: schema.sequenceEnrollments.status,
      currentStep: schema.sequenceEnrollments.currentStep,
      enrolledAt: schema.sequenceEnrollments.enrolledAt,
    })
    .from(schema.sequenceEnrollments)
    .innerJoin(schema.leads, eq(schema.sequenceEnrollments.leadId, schema.leads.id))
    .where(eq(schema.sequenceEnrollments.orgId, orgId))
    .orderBy(asc(schema.sequenceEnrollments.enrolledAt));
}

export interface LeadOption {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
}

/** Lightweight org leads list for the sequence enrollment picker. */
export async function getOrgLeadOptions(orgId: string): Promise<LeadOption[]> {
  return db
    .select({
      id: schema.leads.id,
      name: schema.leads.name,
      company: schema.leads.company,
      phone: schema.leads.phone,
      email: schema.leads.email,
    })
    .from(schema.leads)
    .where(eq(schema.leads.orgId, orgId))
    .orderBy(asc(schema.leads.name))
    .limit(500);
}
