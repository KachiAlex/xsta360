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
      })),
    enrollmentCount: enrollmentCounts.get(seq.id) ?? 0,
  }));
}
