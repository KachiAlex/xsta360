import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { logEvent } from "@/lib/audit";

/**
 * Enroll a lead in a sequence. Creates the enrollment record.
 * The cron job will process steps based on delayDays.
 */
export async function enrollLeadInSequence(
  orgId: string,
  leadId: string,
  sequenceId: string,
  enrolledBy: string,
): Promise<{ ok: boolean; message?: string }> {
  // Check sequence exists and is active.
  const [seq] = await db
    .select()
    .from(schema.sequences)
    .where(
      and(eq(schema.sequences.id, sequenceId), eq(schema.sequences.orgId, orgId)),
    )
    .limit(1);

  if (!seq) return { ok: false, message: "Sequence not found" };
  if (!seq.active) return { ok: false, message: "Sequence is not active" };

  // Check lead isn't already enrolled in this sequence.
  const [existing] = await db
    .select()
    .from(schema.sequenceEnrollments)
    .where(
      and(
        eq(schema.sequenceEnrollments.sequenceId, sequenceId),
        eq(schema.sequenceEnrollments.leadId, leadId),
        eq(schema.sequenceEnrollments.status, "active"),
      ),
    )
    .limit(1);

  if (existing) return { ok: false, message: "Lead already enrolled" };

  const [enrollment] = await db
    .insert(schema.sequenceEnrollments)
    .values({
      orgId,
      sequenceId,
      leadId,
      enrolledBy,
      currentStep: 0,
      status: "active",
    })
    .returning();

  await logEvent(orgId, "sequence_enrolled", {
    leadId,
    actorId: enrolledBy,
    meta: { sequenceId, enrollmentId: enrollment.id },
  });

  return { ok: true };
}

/**
 * Process due sequence steps. Called by the cron job.
 * For each active enrollment, checks if the next step is due and executes it.
 */
export async function processSequenceSteps(): Promise<{ processed: number }> {
  const now = new Date();
  let processed = 0;

  // Get all active enrollments.
  const enrollments = await db
    .select()
    .from(schema.sequenceEnrollments)
    .where(eq(schema.sequenceEnrollments.status, "active"));

  for (const enrollment of enrollments) {
    // Get the next step (currentStep + 1, ordered by position).
    const steps = await db
      .select()
      .from(schema.sequenceSteps)
      .where(eq(schema.sequenceSteps.sequenceId, enrollment.sequenceId))
      .orderBy(asc(schema.sequenceSteps.position));

    const nextStepIndex = enrollment.currentStep;
    if (nextStepIndex >= steps.length) {
      // Sequence complete.
      await db
        .update(schema.sequenceEnrollments)
        .set({ status: "completed", completedAt: now, updatedAt: now })
        .where(eq(schema.sequenceEnrollments.id, enrollment.id));
      continue;
    }

    const nextStep = steps[nextStepIndex];
    if (!nextStep) continue;

    // Check if enough days have passed since enrollment.
    const dueDate = new Date(enrollment.enrolledAt.getTime() + nextStep.delayDays * 86_400_000);
    if (now < dueDate) continue;

    // Execute the step: create a reminder.
    const [lead] = await db
      .select()
      .from(schema.leads)
      .where(eq(schema.leads.id, enrollment.leadId))
      .limit(1);

    if (!lead) {
      // Lead was deleted — cancel enrollment.
      await db
        .update(schema.sequenceEnrollments)
        .set({ status: "cancelled", updatedAt: now })
        .where(eq(schema.sequenceEnrollments.id, enrollment.id));
      continue;
    }

    // Create a reminder for this step.
    const reminderNote = nextStep.subject
      ? `${nextStep.subject}: ${nextStep.body}`
      : nextStep.body;

    await db.insert(schema.reminders).values({
      leadId: enrollment.leadId,
      orgId: enrollment.orgId,
      assigneeId: lead.assigneeId,
      dueAt: now,
      note: `[Sequence] ${reminderNote}`,
    });

    await logEvent(enrollment.orgId, "sequence_step_sent", {
      leadId: enrollment.leadId,
      actorId: enrollment.enrolledBy ?? undefined,
      meta: {
        sequenceId: enrollment.sequenceId,
        stepId: nextStep.id,
        stepPosition: nextStep.position,
      },
    });

    // Advance to next step.
    await db
      .update(schema.sequenceEnrollments)
      .set({
        currentStep: enrollment.currentStep + 1,
        updatedAt: now,
      })
      .where(eq(schema.sequenceEnrollments.id, enrollment.id));

    processed++;
  }

  return { processed };
}
