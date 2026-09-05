import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, schema } from "@/db";
import { logEvent } from "@/lib/audit";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendMail } from "@/lib/email";
import { replacePlaceholders, buildEmailHtml, buildEmailHtmlFromRich, formatWhatsAppMessage } from "@/lib/message-format";

/**
 * Enroll a lead in a sequence. Creates the enrollment record.
 * Generates a unique unsubscribe token for the enrollment.
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

  // Check lead isn't unsubscribed
  const [lead] = await db
    .select({ unsubscribedAt: schema.leads.unsubscribedAt })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, orgId)))
    .limit(1);

  if (lead?.unsubscribedAt) {
    return { ok: false, message: "Lead has unsubscribed from sequence emails" };
  }

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
      unsubscribeToken: randomUUID(),
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
 * Check if the current time is within the sequence's sending window.
 * Returns true if we should send now, false if we should wait.
 */
function isWithinSendWindow(
  seq: { sendWindowStart: string | null; sendWindowEnd: string | null; skipWeekends: boolean; timezone: string },
  now: Date,
): boolean {
  // If no window configured, send anytime.
  if (!seq.sendWindowStart || !seq.sendWindowEnd) return true;

  // Get current time in the sequence's timezone.
  // We use Intl to format the time in the target timezone.
  const tz = seq.timezone || "Africa/Lagos";
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(now);
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minutePart = parts.find((p) => p.type === "minute")?.value ?? "0";
  const weekdayPart = parts.find((p) => p.type === "weekday")?.value ?? "";

  // Skip weekends if configured
  if (seq.skipWeekends && (weekdayPart === "Sat" || weekdayPart === "Sun")) {
    return false;
  }

  const currentMinutes = parseInt(hourPart) * 60 + parseInt(minutePart);
  const [startH, startM] = seq.sendWindowStart.split(":").map(Number);
  const [endH, endM] = seq.sendWindowEnd.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * Process due sequence steps. Called by the cron job.
 * For each active enrollment, checks if the next step is due and executes it.
 *
 * Features:
 * - Business hours / weekend skip
 * - Skip unsubscribed leads
 * - Skip paused enrollments (paused on reply/bounce/unsubscribe)
 * - Email open/click tracking via tracking pixel + link rewriting
 * - Unsubscribe link in email footer
 * - A/B testing: randomly assign variant A or B
 * - Record email events for analytics
 */
export async function processSequenceSteps(): Promise<{
  processed: number;
  emailsSent: number;
  whatsappSent: number;
  remindersCreated: number;
  skippedWindow: number;
}> {
  const now = new Date();
  let processed = 0;
  let emailsSent = 0;
  let whatsappSent = 0;
  let remindersCreated = 0;
  let skippedWindow = 0;

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

    // Skip unsubscribed leads for email steps.
    if (lead.unsubscribedAt && nextStep.action === "email") {
      await db
        .update(schema.sequenceEnrollments)
        .set({
          status: "paused",
          pausedReason: "unsubscribed",
          pausedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.sequenceEnrollments.id, enrollment.id));
      continue;
    }

    // Load the sequence for business hours.
    const [seq] = await db
      .select()
      .from(schema.sequences)
      .where(eq(schema.sequences.id, enrollment.sequenceId))
      .limit(1);

    // Check business hours for email/whatsapp steps (reminders can fire anytime).
    if (nextStep.action !== "reminder" && seq) {
      if (!isWithinSendWindow(seq, now)) {
        skippedWindow++;
        continue;
      }
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

    // A/B testing: pick variant
    let useVariantB = false;
    if (nextStep.variantBBody && nextStep.action === "email") {
      useVariantB = Math.random() < 0.5;
    }

    const stepBody = useVariantB ? (nextStep.variantBBody || nextStep.body) : nextStep.body;
    const stepSubject = useVariantB ? (nextStep.variantBSubject || nextStep.subject) : nextStep.subject;
    const stepSenderName = useVariantB ? (nextStep.variantBSenderName || nextStep.senderName) : nextStep.senderName;
    const variant = useVariantB ? "b" : "a";

    switch (action) {
      case "email": {
        // Send email directly to the lead.
        if (lead.email) {
          try {
            const personalizedBody = replacePlaceholders(stepBody, msgCtx);
            const personalizedSubject = replacePlaceholders(
              stepSubject || `Message from ${orgName}`,
              msgCtx,
            );

            // Create a tracking event record first (we need the ID for the pixel).
            const [emailEvent] = await db
              .insert(schema.sequenceEmailEvents)
              .values({
                orgId: enrollment.orgId,
                enrollmentId: enrollment.id,
                stepId: nextStep.id,
                leadId: lead.id,
                eventType: "sent",
                variant,
              })
              .returning();

            const appUrl = process.env.APP_URL ?? "https://xsta360.com.ng";
            const tracking = {
              eventId: emailEvent.id,
              appUrl,
              unsubscribeToken: enrollment.unsubscribeToken || "",
            };

            // If body is already HTML (from rich text editor), use it directly.
            // Otherwise, convert markdown to HTML.
            const isHtml = /<[a-z][\s\S]*>/i.test(stepBody);
            const emailHtml = isHtml
              ? buildEmailHtmlFromRich(personalizedBody, orgName, tracking)
              : buildEmailHtml(personalizedBody, orgName, tracking);

            // Fetch attachment download URLs.
            const attachmentIds = (nextStep.attachments as string[]) ?? [];
            let attachments: { filename: string; path: string; contentType?: string }[] = [];
            if (attachmentIds.length > 0) {
              const docs = await db
                .select({
                  id: schema.documents.id,
                  fileName: schema.documents.fileName,
                  r2Key: schema.documents.r2Key,
                  publicUrl: schema.documents.publicUrl,
                  mimeType: schema.documents.mimeType,
                })
                .from(schema.documents)
                .where(
                  and(
                    eq(schema.documents.orgId, enrollment.orgId),
                    inArray(schema.documents.id, attachmentIds),
                  ),
                );
              const { getDownloadUrl } = await import("@/lib/r2");
              for (const doc of docs) {
                const url = await getDownloadUrl(doc.r2Key, doc.publicUrl);
                attachments.push({
                  filename: doc.fileName,
                  path: url,
                  contentType: doc.mimeType,
                });
              }
            }

            await sendMail(
              lead.email,
              personalizedSubject,
              emailHtml,
              {
                senderName: stepSenderName || orgName,
                replyTo: org?.replyToEmail || undefined,
                attachments,
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
          const personalizedBody = replacePlaceholders(stepBody, msgCtx);
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
        variant,
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

  return { processed, emailsSent, whatsappSent, remindersCreated, skippedWindow };
}
