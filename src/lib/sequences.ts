import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { logEvent } from "@/lib/audit";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendMail } from "@/lib/email";
import { replacePlaceholders, buildEmailHtml, buildEmailHtmlFromRich, formatWhatsAppMessage } from "@/lib/message-format";

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
 *
 * Step actions:
 * - "reminder" → create a reminder for the rep (assignee) to follow up
 * - "email" → send an email directly to the lead
 * - "whatsapp" → send a WhatsApp message directly to the lead
 */
export async function processSequenceSteps(): Promise<{
  processed: number;
  emailsSent: number;
  whatsappSent: number;
  remindersCreated: number;
}> {
  const now = new Date();
  let processed = 0;
  let emailsSent = 0;
  let whatsappSent = 0;
  let remindersCreated = 0;

  // Get all active enrollments.
  const enrollments = await db
    .select()
    .from(schema.sequenceEnrollments)
    .where(eq(schema.sequenceEnrollments.status, "active"));

  for (const enrollment of enrollments) {
    // Get the next step (currentStep index, ordered by position).
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

    // Load the lead.
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

    // Load the org for WhatsApp config, org name, and reply-to email.
    const [org] = await db
      .select({
        name: schema.organizations.name,
        whatsappConfig: schema.organizations.whatsappConfig,
        replyToEmail: schema.organizations.replyToEmail,
      })
      .from(schema.organizations)
      .where(eq(schema.organizations.id, enrollment.orgId))
      .limit(1);

    // Load the assignee (rep) for placeholder substitution.
    let repName: string | null = null;
    if (lead.assigneeId) {
      const [rep] = await db
        .select({ name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, lead.assigneeId))
        .limit(1);
      repName = rep?.name ?? null;
    }

    const orgName = org?.name ?? "Xsta360";
    const msgCtx = {
      leadName: lead.name,
      leadCompany: lead.company,
      leadPhone: lead.phone,
      leadEmail: lead.email,
      repName,
      orgName,
    };

    const action = nextStep.action || "reminder";
    const reminderNote = nextStep.subject
      ? `${nextStep.subject}: ${nextStep.body}`
      : nextStep.body;

    switch (action) {
      case "email": {
        // Send email directly to the lead.
        if (lead.email) {
          try {
            const personalizedBody = replacePlaceholders(nextStep.body, msgCtx);
            const personalizedSubject = replacePlaceholders(
              nextStep.subject || `Message from ${orgName}`,
              msgCtx,
            );
            // If body is already HTML (from rich text editor), use it directly.
            // Otherwise, convert markdown to HTML.
            const isHtml = /<[a-z][\s\S]*>/i.test(nextStep.body);
            const emailHtml = isHtml
              ? buildEmailHtmlFromRich(personalizedBody, orgName)
              : buildEmailHtml(personalizedBody, orgName);

            await sendMail(
              lead.email,
              personalizedSubject,
              emailHtml,
              {
                senderName: nextStep.senderName || orgName,
                replyTo: org?.replyToEmail || undefined,
              },
            );
            emailsSent++;
          } catch (err) {
            console.error(`Sequence email failed for lead ${lead.id}:`, err);
          }
        }
        // Also create a reminder record for tracking.
        await db.insert(schema.reminders).values({
          leadId: enrollment.leadId,
          orgId: enrollment.orgId,
          assigneeId: lead.assigneeId,
          dueAt: now,
          note: `[Sequence] Email sent to lead: ${reminderNote}`,
          status: "sent",
          sequenceStepId: nextStep.id,
          channel: "email",
        });
        break;
      }

      case "whatsapp": {
        // Send WhatsApp message directly to the lead.
        const whatsappConfig = org?.whatsappConfig as
          | { enabled?: boolean; phoneNumberId?: string; apiKey?: string }
          | undefined;
        if (whatsappConfig?.enabled && whatsappConfig.phoneNumberId && whatsappConfig.apiKey && lead.phone) {
          const personalizedBody = replacePlaceholders(nextStep.body, msgCtx);
          const msg = formatWhatsAppMessage(personalizedBody, orgName);
          const result = await sendWhatsAppMessage(whatsappConfig, lead.phone, msg);
          if (result.success) {
            whatsappSent++;
          } else {
            console.error(`Sequence WhatsApp failed for lead ${lead.id}:`, result.error);
          }
        }
        // Create a reminder record for tracking.
        await db.insert(schema.reminders).values({
          leadId: enrollment.leadId,
          orgId: enrollment.orgId,
          assigneeId: lead.assigneeId,
          dueAt: now,
          note: `[Sequence] WhatsApp sent to lead: ${reminderNote}`,
          status: whatsappConfig?.enabled && lead.phone ? "sent" : "failed",
          sequenceStepId: nextStep.id,
          channel: "whatsapp",
          lastError: !whatsappConfig?.enabled ? "WhatsApp not configured" : !lead.phone ? "No phone number" : undefined,
        });
        break;
      }

      default: {
        // "reminder" — create a reminder for the rep (assignee).
        await db.insert(schema.reminders).values({
          leadId: enrollment.leadId,
          orgId: enrollment.orgId,
          assigneeId: lead.assigneeId,
          dueAt: now,
          note: `[Sequence] ${reminderNote}`,
          sequenceStepId: nextStep.id,
          channel: "reminder",
        });
        remindersCreated++;
        break;
      }
    }

    await logEvent(enrollment.orgId, "sequence_step_sent", {
      leadId: enrollment.leadId,
      actorId: enrollment.enrolledBy ?? undefined,
      meta: {
        sequenceId: enrollment.sequenceId,
        stepId: nextStep.id,
        stepPosition: nextStep.position,
        action,
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

  return { processed, emailsSent, whatsappSent, remindersCreated };
}
