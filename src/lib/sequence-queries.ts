import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export interface SequenceWithSteps {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  steps: {
    id: string;
    position: number;
    delayDays: number;
    action: string;
    subject: string | null;
    body: string;
    senderName: string | null;
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

  // Fetch step counts per sequence.
  const stepCounts = new Map<string, number>();
  for (const e of enrollments) {
    if (!stepCounts.has(e.sequenceId)) {
      const steps = await db
        .select({ id: schema.sequenceSteps.id })
        .from(schema.sequenceSteps)
        .where(eq(schema.sequenceSteps.sequenceId, e.sequenceId));
      stepCounts.set(e.sequenceId, steps.length);
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
  }));
}
