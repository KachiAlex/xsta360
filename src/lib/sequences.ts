import "server-only";
import { and, asc, count, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";
import { db, schema } from "@/db";
import { isSubscriptionBlocked, getOrgPlan, getPlanQuota } from "@/lib/dal";
import { getOrgSendUsage, type OrgSendUsage } from "@/lib/usage";
import { broadcastToOrg } from "@/lib/notifications";
import { logEvent } from "@/lib/audit";
import {
  sendWhatsAppMessage,
  sendWhatsAppTemplateMessage,
  getWhatsAppTemplate,
  createWhatsAppTemplate,
} from "@/lib/whatsapp";
import { sendMail } from "@/lib/email";
import { replacePlaceholders, buildEmailHtml, buildEmailHtmlFromRich, formatWhatsAppMessage } from "@/lib/message-format";

/** Max send attempts per step before the enrollment is paused as failed. */
const MAX_STEP_FAILURES = 3;

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

  if (!lead) return { ok: false, message: "Lead not found" };
  if (lead.unsubscribedAt) {
    return { ok: false, message: "Lead has unsubscribed from sequence emails" };
  }

  // Check lead isn't already enrolled in this sequence.
  const [existing] = await db
    .select()
    .from(schema.sequenceEnrollments)
    .where(
      and(
        eq(schema.sequenceEnrollments.orgId, orgId),
        eq(schema.sequenceEnrollments.sequenceId, sequenceId),
        eq(schema.sequenceEnrollments.leadId, leadId),
        inArray(schema.sequenceEnrollments.status, ["active", "processing"]),
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
  try {
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
  } catch {
    // Invalid timezone or malformed window config — allow sending rather
    // than crashing the cron. Bad config shouldn't block all sequences.
    return true;
  }
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
export async function processSequenceSteps(opts?: {
  orgId?: string;
  sequenceId?: string;
}): Promise<{
  processed: number;
  emailsSent: number;
  whatsappSent: number;
  remindersCreated: number;
  skippedWindow: number;
  quotaHeld: number;
}> {
  const now = new Date();
  let processed = 0;
  let emailsSent = 0;
  let whatsappSent = 0;
  let remindersCreated = 0;
  let skippedWindow = 0;
  let quotaHeld = 0;

  // Get all claimable enrollments (optionally scoped to one org/sequence).
  // "active" rows plus "processing" rows abandoned >10 min (crashed run) —
  // the claim below flips status to "processing" atomically so a concurrent
  // cron or manual "Run now" can't process the same enrollment twice.
  const staleClaimBefore = new Date(now.getTime() - 10 * 60 * 1000);
  const enrollmentConditions = [
    or(
      eq(schema.sequenceEnrollments.status, "active"),
      and(
        eq(schema.sequenceEnrollments.status, "processing"),
        lt(schema.sequenceEnrollments.updatedAt, staleClaimBefore),
      ),
    )!,
  ];
  if (opts?.orgId) enrollmentConditions.push(eq(schema.sequenceEnrollments.orgId, opts.orgId));
  if (opts?.sequenceId) enrollmentConditions.push(eq(schema.sequenceEnrollments.sequenceId, opts.sequenceId));
  const enrollments = await db
    .select()
    .from(schema.sequenceEnrollments)
    .where(and(...enrollmentConditions));

  // Skip enrollments in blocked orgs (lapsed/canceled subscription) — a
  // locked-out tenant shouldn't keep sending drip emails/WhatsApps.
  const enrollmentOrgIds = [...new Set(enrollments.map((e) => e.orgId))];
  const blockedOrgIds = new Set<string>();
  for (const orgId of enrollmentOrgIds) {
    if (await isSubscriptionBlocked(orgId)) blockedOrgIds.add(orgId);
  }

  // Prefetch all steps and leads in bulk to avoid N+1 queries.
  const sequenceIds = [...new Set(enrollments.map((e) => e.sequenceId))];
  const leadIds = [...new Set(enrollments.map((e) => e.leadId))];

  const allSteps = sequenceIds.length
    ? await db
        .select()
        .from(schema.sequenceSteps)
        .where(inArray(schema.sequenceSteps.sequenceId, sequenceIds))
        .orderBy(asc(schema.sequenceSteps.position))
    : [];
  // Group steps by sequenceId.
  const stepsBySeq = new Map<string, typeof allSteps>();
  for (const s of allSteps) {
    const arr = stepsBySeq.get(s.sequenceId) ?? [];
    arr.push(s);
    stepsBySeq.set(s.sequenceId, arr);
  }

  const allLeads = leadIds.length
    ? await db
        .select()
        .from(schema.leads)
        .where(inArray(schema.leads.id, leadIds))
    : [];
  const leadsById = new Map(allLeads.map((l) => [l.id, l]));

  // Per-org plan + send-usage caches — the quota check would otherwise
  // query the same rows once per enrollment.
  const planByOrg = new Map<string, Awaited<ReturnType<typeof getOrgPlan>>>();
  const usageByOrg = new Map<string, OrgSendUsage>();
  const quotaNotified = new Set<string>();

  for (const enrollment of enrollments) {
    if (blockedOrgIds.has(enrollment.orgId)) continue;
    // Use prefetched steps (already ordered by position).
    const steps = stepsBySeq.get(enrollment.sequenceId) ?? [];

    // Leads can be enrolled before any steps exist — keep the enrollment
    // active and waiting rather than instantly marking it "completed".
    if (steps.length === 0) continue;

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

    const action = nextStep.action || "reminder";

    // Delay anchors to enrollment for step 0, and to when the previous
    // step fired for all later steps.
    const anchor =
      nextStepIndex === 0
        ? enrollment.enrolledAt
        : (enrollment.lastStepAt ?? enrollment.enrolledAt);
    const dueDate = new Date(anchor.getTime() + nextStep.delayDays * 86_400_000);
    if (now < dueDate) continue;

    // Use prefetched lead.
    const lead = leadsById.get(enrollment.leadId);

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

    // Plan send quotas — the step holds (and retries next run) once the
    // org's monthly allowance or daily WhatsApp cap is exhausted. Sends
    // stay queued rather than being dropped, so an upgrade resumes them.
    let usage: OrgSendUsage | undefined;
    if (action === "email" || action === "whatsapp") {
      let plan = planByOrg.get(enrollment.orgId);
      if (!plan) {
        plan = await getOrgPlan(enrollment.orgId);
        planByOrg.set(enrollment.orgId, plan);
      }
      usage = usageByOrg.get(enrollment.orgId);
      if (!usage) {
        usage = await getOrgSendUsage(enrollment.orgId, now);
        usageByOrg.set(enrollment.orgId, usage);
      }

      const monthlyLimit = getPlanQuota(
        plan,
        action === "email" ? "email_monthly_limit" : "whatsapp_monthly_limit",
      );
      const monthlyUsed =
        action === "email" ? usage.emailsThisMonth : usage.whatsappThisMonth;
      const dailyLimit =
        action === "whatsapp" ? getPlanQuota(plan, "whatsapp_daily_limit") : null;
      const overMonthly = monthlyLimit != null && monthlyUsed >= monthlyLimit;
      const overDaily = dailyLimit != null && usage.whatsappToday >= dailyLimit;

      if (overMonthly || overDaily) {
        quotaHeld++;
        await maybeNotifyQuota(enrollment.orgId, action, overDaily, now, quotaNotified);
        continue;
      }
    }

    // Claim the enrollment before sending. The UPDATE only matches if the
    // row is still claimable ("active", or a stale "processing"), so a
    // second worker that already fetched this row loses the race and skips.
    const claimed = await db
      .update(schema.sequenceEnrollments)
      .set({ status: "processing", updatedAt: now })
      .where(
        and(
          eq(schema.sequenceEnrollments.id, enrollment.id),
          or(
            eq(schema.sequenceEnrollments.status, "active"),
            and(
              eq(schema.sequenceEnrollments.status, "processing"),
              lt(schema.sequenceEnrollments.updatedAt, staleClaimBefore),
            ),
          ),
        ),
      )
      .returning({ id: schema.sequenceEnrollments.id });
    if (claimed.length === 0) continue;

    // Load the org for WhatsApp config, org name, reply-to, and custom email domain.
    const [org] = await db
      .select({
        name: schema.organizations.name,
        whatsappConfig: schema.organizations.whatsappConfig,
        replyToEmail: schema.organizations.replyToEmail,
        emailDomainStatus: schema.organizations.emailDomainStatus,
        emailFromAddress: schema.organizations.emailFromAddress,
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

    // Track the outcome so we only advance currentStep when appropriate.
    // - "delivered": sent successfully → advance
    // - "skipped": permanent condition (no email/phone/config) → advance (retrying won't help)
    // - "failed": transient error (SMTP/WhatsApp API) → don't advance, retry next run
    // - "pending": waiting on Meta template approval → don't advance, retry next run (not a failure)
    let stepOutcome: "delivered" | "skipped" | "failed" | "pending" = "skipped";

    switch (action) {
      case "email": {
        // Send email directly to the lead.
        if (lead.email) {
          let emailSent = false;
          let emailEventId: string | undefined;
          stepOutcome = "failed"; // default to failed; set to delivered on success
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
            emailEventId = emailEvent.id;

            const appUrl = process.env.APP_URL ?? "https://xsta360.com.ng";
            const tracking = {
              eventId: emailEventId,
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

            // Custom sender domain only when Brevo has authenticated it —
            // otherwise fall back to the platform sender.
            const customFrom =
              org?.emailDomainStatus === "authenticated" && org.emailFromAddress
                ? org.emailFromAddress
                : undefined;

            await sendMail(
              lead.email,
              personalizedSubject,
              emailHtml,
              {
                senderName: stepSenderName || orgName,
                replyTo: org?.replyToEmail || undefined,
                fromEmail: customFrom,
                attachments,
              },
            );
            emailsSent++;
            emailSent = true;
          } catch (err) {
            console.error(`Sequence email failed for lead ${lead.id}:`, err);
            // Mark the pre-created "sent" event as "failed" so analytics
            // don't count unsuccessful SMTP sends as delivered.
            try {
              if (emailEventId) {
                await db
                  .update(schema.sequenceEmailEvents)
                  .set({ eventType: "failed" })
                  .where(eq(schema.sequenceEmailEvents.id, emailEventId));
              }
            } catch {
              // best-effort cleanup
            }
            // After repeated failures (e.g. a permanently invalid address),
            // pause the enrollment instead of retrying every cron run forever.
            const failRows = await db
              .select({ value: count() })
              .from(schema.sequenceEmailEvents)
              .where(
                and(
                  eq(schema.sequenceEmailEvents.enrollmentId, enrollment.id),
                  eq(schema.sequenceEmailEvents.stepId, nextStep.id),
                  eq(schema.sequenceEmailEvents.eventType, "failed"),
                ),
              );
            if ((failRows[0]?.value ?? 0) >= MAX_STEP_FAILURES) {
              await db
                .update(schema.sequenceEnrollments)
                .set({
                  status: "paused",
                  pausedReason: "failed",
                  pausedAt: now,
                  updatedAt: now,
                })
                .where(eq(schema.sequenceEnrollments.id, enrollment.id));
            }
          }
          // Create a reminder record for tracking (only if email was actually sent).
          if (emailSent) {
            stepOutcome = "delivered";
            await db.insert(schema.reminders).values({
              leadId: enrollment.leadId,
              orgId: enrollment.orgId,
              assigneeId: lead.assigneeId,
              dueAt: now,
              note: `[Sequence] Email sent to lead: ${reminderNote}`,
              status: "sent",
              sentAt: now,
              sequenceStepId: nextStep.id,
              channel: "email",
            });
          }
        }
        break;
      }

      case "whatsapp": {
        // Send WhatsApp message directly to the lead.
        // Meta only delivers free-form text to numbers that messaged us in the
        // last 24h — cold sequence outreach must go through an approved message
        // template, auto-created per step (named after the step + body hash so
        // edits produce a fresh template submission).
        const whatsappConfig = org?.whatsappConfig as
          | { enabled?: boolean; phoneNumberId?: string; apiKey?: string; wabaId?: string }
          | undefined;
        let whatsappSuccess = false;
        let whatsappError: string | undefined;
        let whatsappWamid: string | undefined;
        stepOutcome = "skipped"; // default: permanent skip if no config/phone
        if (whatsappConfig?.enabled && whatsappConfig.phoneNumberId && whatsappConfig.apiKey && lead.phone) {
          stepOutcome = "failed"; // has config+phone; failed unless send succeeds
          // Inside Meta's 24h customer-service window (lead messaged us
          // recently) send free-form — session messages aren't subject to
          // the marketing-template frequency cap (error 131049). Without a
          // WABA there is no template path, so free-form is the only option.
          const withinServiceWindow =
            lead.lastWhatsappInboundAt != null &&
            now.getTime() - lead.lastWhatsappInboundAt.getTime() < 24 * 3600_000;
          if (withinServiceWindow || !whatsappConfig.wabaId) {
            const personalizedBody = replacePlaceholders(stepBody, msgCtx);
            const msg = formatWhatsAppMessage(personalizedBody, orgName);
            const result = await sendWhatsAppMessage(whatsappConfig, lead.phone, msg);
            if (result.success) {
              whatsappSent++;
              whatsappSuccess = true;
              whatsappWamid = result.wamid;
              stepOutcome = "delivered";
            } else {
              whatsappError = result.error || "WhatsApp send failed";
            }
          } else {
            // Template path — works for cold outreach once Meta approves it.
            const tokens: string[] = [];
            const positionalBody = stepBody.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
              tokens.push(key);
              return `{{${tokens.length}}}`;
            });
            const templateText = `${positionalBody}\n\n— ${orgName}`;
            const hash = createHash("sha256").update(templateText).digest("hex").slice(0, 8);
            const templateName = `xsta_${nextStep.id.replace(/-/g, "").slice(0, 8)}_${hash}`;

            let status: string | undefined;
            const existing = await getWhatsAppTemplate(whatsappConfig, templateName);
            if (existing.success) {
              status = existing.status;
              if (!status) {
                const examples = tokens.map(
                  (t) => replacePlaceholders(`{{${t}}}`, msgCtx) || "Sample",
                );
                const created = await createWhatsAppTemplate(whatsappConfig, {
                  name: templateName,
                  category: "MARKETING",
                  language: "en_US",
                  body: templateText,
                  examples,
                });
                if (created.success) {
                  const check = await getWhatsAppTemplate(whatsappConfig, templateName);
                  status = check.status ?? "PENDING";
                } else {
                  whatsappError = `Template creation failed: ${created.error}`;
                }
              }
            } else {
              whatsappError = `Template lookup failed: ${existing.error}`;
            }

            if (status === "APPROVED") {
              const params = tokens.map((t) => replacePlaceholders(`{{${t}}}`, msgCtx));
              const result = await sendWhatsAppTemplateMessage(
                whatsappConfig,
                lead.phone,
                templateName,
                params,
              );
              if (result.success) {
                whatsappSent++;
                whatsappSuccess = true;
                whatsappWamid = result.wamid;
                stepOutcome = "delivered";
              } else {
                whatsappError = result.error || "WhatsApp send failed";
                console.error(`Sequence WhatsApp failed for lead ${lead.id}:`, result.error);
              }
            } else if (status === "REJECTED" || status === "PAUSED" || status === "DISABLED") {
              whatsappError = `WhatsApp template ${status.toLowerCase()} by Meta — edit the step text to resubmit`;
            } else if (status) {
              // PENDING / IN_APPEAL — wait for approval, retry next cron run.
              stepOutcome = "pending";
              whatsappError = "Waiting for Meta to approve the message template";
            }
          }
        } else {
          whatsappError = !whatsappConfig?.enabled
            ? "WhatsApp not configured"
            : !lead.phone
              ? "No phone number"
              : "Missing WhatsApp config";
        }
        // Create a reminder record for tracking — only on an actual send
        // attempt (delivered/failed). Permanent skips (no phone/config) and
        // pending template approvals shouldn't pile up tracking rows.
        if (stepOutcome === "delivered" || stepOutcome === "failed") {
          await db.insert(schema.reminders).values({
            leadId: enrollment.leadId,
            orgId: enrollment.orgId,
            assigneeId: lead.assigneeId,
            dueAt: now,
            note: `[Sequence] WhatsApp sent to lead: ${reminderNote}`,
            status: whatsappSuccess ? "sent" : "failed",
            sentAt: whatsappSuccess ? now : null,
            sequenceStepId: nextStep.id,
            channel: "whatsapp",
            lastError: whatsappError,
            wamid: whatsappWamid,
            deliveryStatus: whatsappSuccess ? "sent" : undefined,
          });
        }
        // After repeated API failures, pause rather than retry every cron run.
        // Scoped to this enrollment (createdAt >= enrolledAt) so a re-enrolled
        // lead starts with a clean failure count.
        if (stepOutcome === "failed") {
          const waFailRows = await db
            .select({ value: count() })
            .from(schema.reminders)
            .where(
              and(
                eq(schema.reminders.leadId, enrollment.leadId),
                eq(schema.reminders.sequenceStepId, nextStep.id),
                eq(schema.reminders.channel, "whatsapp"),
                eq(schema.reminders.status, "failed"),
                gte(schema.reminders.createdAt, enrollment.enrolledAt),
              ),
            );
          if ((waFailRows[0]?.value ?? 0) >= MAX_STEP_FAILURES) {
            await db
              .update(schema.sequenceEnrollments)
              .set({
                status: "paused",
                pausedReason: "failed",
                pausedAt: now,
                updatedAt: now,
              })
              .where(eq(schema.sequenceEnrollments.id, enrollment.id));
          }
        }
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
        stepOutcome = "delivered";
        remindersCreated++;
        break;
      }
    }

    // Count the send toward the org's usage so this run can't overshoot
    // the plan's allowance.
    if (stepOutcome === "delivered" && usage) {
      if (action === "email") usage.emailsThisMonth++;
      else if (action === "whatsapp") {
        usage.whatsappThisMonth++;
        usage.whatsappToday++;
      }
    }

    // Only log and advance when the step was delivered or permanently skipped.
    // On transient failure or pending template approval we leave currentStep
    // unchanged so the cron retries — but first release the claim so the next
    // run can pick the enrollment up again immediately.
    if (stepOutcome === "failed" || stepOutcome === "pending") {
      // Release the claim — only if it's still ours. If the enrollment was
      // paused/cancelled mid-send, leave that status alone.
      await db
        .update(schema.sequenceEnrollments)
        .set({ status: "active", updatedAt: now })
        .where(
          and(
            eq(schema.sequenceEnrollments.id, enrollment.id),
            eq(schema.sequenceEnrollments.status, "processing"),
          ),
        );
      continue;
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

    // Advance to next step — record when this step fired so the next
    // step's delay counts from now, not from enrollment.
    await db
      .update(schema.sequenceEnrollments)
      .set({
        currentStep: enrollment.currentStep + 1,
        lastStepAt: now,
        updatedAt: now,
      })
      .where(eq(schema.sequenceEnrollments.id, enrollment.id));

    // Release the "processing" claim — unless the enrollment was paused or
    // cancelled mid-send (a reply webhook or manual pause), which wins.
    await db
      .update(schema.sequenceEnrollments)
      .set({ status: "active", updatedAt: now })
      .where(
        and(
          eq(schema.sequenceEnrollments.id, enrollment.id),
          eq(schema.sequenceEnrollments.status, "processing"),
        ),
      );

    processed++;
  }

  return { processed, emailsSent, whatsappSent, remindersCreated, skippedWindow, quotaHeld };
}

/**
 * Notify the org once per quota period (month/day) that a send channel is
 * exhausted — deduplicates via the notifications table so a run holding 50
 * steps doesn't blast 50 alerts.
 */
async function maybeNotifyQuota(
  orgId: string,
  channel: "email" | "whatsapp",
  overDaily: boolean,
  now: Date,
  notified: Set<string>,
) {
  const key = `${orgId}:${channel}:${overDaily ? "daily" : "monthly"}`;
  if (notified.has(key)) return;
  notified.add(key);
  try {
    const since = overDaily
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const title = overDaily
      ? "Daily WhatsApp limit reached"
      : `Monthly ${channel === "email" ? "email" : "WhatsApp"} quota reached`;
    const [seen] = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.orgId, orgId),
          eq(schema.notifications.type, "quota_exceeded"),
          eq(schema.notifications.title, title),
          gte(schema.notifications.createdAt, since),
        ),
      )
      .limit(1);
    if (seen) return;
    await broadcastToOrg({
      orgId,
      type: "quota_exceeded",
      title,
      body: `Your ${overDaily ? "daily" : "monthly"} ${
        channel === "email" ? "email" : "WhatsApp"
      } allowance is used up. Sends resume ${overDaily ? "tomorrow" : "next month"} — or upgrade your plan for a higher limit.`,
      link: "/settings",
    });
  } catch (e) {
    console.error("Quota notification failed:", e);
  }
}
