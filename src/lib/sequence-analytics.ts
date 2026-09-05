import "server-only";
import { and, eq, sql, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db";

export interface SequenceAnalytics {
  sequenceId: string;
  sequenceName: string;
  // Enrollment stats
  totalEnrollments: number;
  activeEnrollments: number;
  completedEnrollments: number;
  pausedEnrollments: number;
  // Email stats
  emailsSent: number;
  emailsDelivered: number;
  emailsOpened: number;
  emailsClicked: number;
  emailsReplied: number;
  emailsBounced: number;
  unsubscribes: number;
  // Rates
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  // Per-step breakdown
  perStep: StepAnalytics[];
}

export interface StepAnalytics {
  stepId: string;
  position: number;
  action: string;
  subject: string | null;
  delayDays: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
  openRate: number;
  clickRate: number;
}

/**
 * Get comprehensive analytics for a sequence.
 */
export async function getSequenceAnalytics(
  orgId: string,
  sequenceId: string,
): Promise<SequenceAnalytics | null> {
  // Verify sequence belongs to org
  const [seq] = await db
    .select()
    .from(schema.sequences)
    .where(and(eq(schema.sequences.id, sequenceId), eq(schema.sequences.orgId, orgId)))
    .limit(1);

  if (!seq) return null;

  // Enrollment stats
  const enrollments = await db
    .select({ status: schema.sequenceEnrollments.status })
    .from(schema.sequenceEnrollments)
    .where(eq(schema.sequenceEnrollments.sequenceId, sequenceId));

  const totalEnrollments = enrollments.length;
  const activeEnrollments = enrollments.filter((e) => e.status === "active").length;
  const completedEnrollments = enrollments.filter((e) => e.status === "completed").length;
  const pausedEnrollments = enrollments.filter((e) => e.status === "paused").length;

  // Get all steps
  const steps = await db
    .select()
    .from(schema.sequenceSteps)
    .where(eq(schema.sequenceSteps.sequenceId, sequenceId))
    .orderBy(sql`${schema.sequenceSteps.position} asc`);

  // Get all email events for this sequence's steps
  const stepIds = steps.map((s) => s.id);
  let allEvents: any[] = [];
  if (stepIds.length > 0) {
    allEvents = await db
      .select()
      .from(schema.sequenceEmailEvents)
      .where(
        and(
          eq(schema.sequenceEmailEvents.orgId, orgId),
          inArraySafe(schema.sequenceEmailEvents.stepId, stepIds),
        ),
      );
  }

  // Aggregate email stats
  const emailsSent = allEvents.filter((e) => e.eventType === "sent").length;
  const emailsDelivered = allEvents.filter((e) => e.eventType === "delivered").length;
  const emailsOpened = allEvents.filter((e) => e.eventType === "opened").length;
  const emailsClicked = allEvents.filter((e) => e.eventType === "clicked").length;
  const emailsReplied = allEvents.filter((e) => e.eventType === "replied").length;
  const emailsBounced = allEvents.filter((e) => e.eventType === "bounced").length;
  const unsubscribes = allEvents.filter((e) => e.eventType === "unsubscribed").length;

  // Per-step breakdown
  const perStep: StepAnalytics[] = steps.map((step) => {
    const stepEvents = allEvents.filter((e) => e.stepId === step.id);
    const sent = stepEvents.filter((e) => e.eventType === "sent").length;
    const opened = stepEvents.filter((e) => e.eventType === "opened").length;
    const clicked = stepEvents.filter((e) => e.eventType === "clicked").length;
    const replied = stepEvents.filter((e) => e.eventType === "replied").length;
    const bounced = stepEvents.filter((e) => e.eventType === "bounced").length;
    const unsubscribed = stepEvents.filter((e) => e.eventType === "unsubscribed").length;
    return {
      stepId: step.id,
      position: step.position,
      action: step.action,
      subject: step.subject,
      delayDays: step.delayDays,
      sent,
      opened,
      clicked,
      replied,
      bounced,
      unsubscribed,
      openRate: sent > 0 ? (opened / sent) * 100 : 0,
      clickRate: sent > 0 ? (clicked / sent) * 100 : 0,
    };
  });

  return {
    sequenceId,
    sequenceName: seq.name,
    totalEnrollments,
    activeEnrollments,
    completedEnrollments,
    pausedEnrollments,
    emailsSent,
    emailsDelivered,
    emailsOpened,
    emailsClicked,
    emailsReplied,
    emailsBounced,
    unsubscribes,
    openRate: emailsSent > 0 ? (emailsOpened / emailsSent) * 100 : 0,
    clickRate: emailsSent > 0 ? (emailsClicked / emailsSent) * 100 : 0,
    replyRate: emailsSent > 0 ? (emailsReplied / emailsSent) * 100 : 0,
    bounceRate: emailsSent > 0 ? (emailsBounced / emailsSent) * 100 : 0,
    unsubscribeRate: emailsSent > 0 ? (unsubscribes / emailsSent) * 100 : 0,
    perStep,
  };
}

/**
 * Get all enrollments for a lead (for lead detail page).
 */
export async function getLeadEnrollments(orgId: string, leadId: string) {
  const enrollments = await db
    .select({
      id: schema.sequenceEnrollments.id,
      sequenceId: schema.sequenceEnrollments.sequenceId,
      status: schema.sequenceEnrollments.status,
      currentStep: schema.sequenceEnrollments.currentStep,
      pausedReason: schema.sequenceEnrollments.pausedReason,
      enrolledAt: schema.sequenceEnrollments.enrolledAt,
      repliedAt: schema.sequenceEnrollments.repliedAt,
      bouncedAt: schema.sequenceEnrollments.bouncedAt,
      sequenceName: schema.sequences.name,
    })
    .from(schema.sequenceEnrollments)
    .innerJoin(schema.sequences, eq(schema.sequenceEnrollments.sequenceId, schema.sequences.id))
    .where(
      and(
        eq(schema.sequenceEnrollments.orgId, orgId),
        eq(schema.sequenceEnrollments.leadId, leadId),
      ),
    )
    .orderBy(sql`${schema.sequenceEnrollments.enrolledAt} desc`);

  return enrollments;
}

/**
 * Get email events for a specific enrollment (for lead detail timeline).
 */
export async function getEnrollmentEvents(orgId: string, enrollmentId: string) {
  const events = await db
    .select({
      id: schema.sequenceEmailEvents.id,
      eventType: schema.sequenceEmailEvents.eventType,
      url: schema.sequenceEmailEvents.url,
      variant: schema.sequenceEmailEvents.variant,
      createdAt: schema.sequenceEmailEvents.createdAt,
      stepId: schema.sequenceEmailEvents.stepId,
    })
    .from(schema.sequenceEmailEvents)
    .where(
      and(
        eq(schema.sequenceEmailEvents.orgId, orgId),
        eq(schema.sequenceEmailEvents.enrollmentId, enrollmentId),
      ),
    )
    .orderBy(sql`${schema.sequenceEmailEvents.createdAt} desc`);

  return events;
}

// Helper since inArray needs to be imported
import { inArray } from "drizzle-orm";
function inArraySafe(col: any, arr: any[]) {
  if (arr.length === 0) return sql`false`;
  return inArray(col, arr);
}
