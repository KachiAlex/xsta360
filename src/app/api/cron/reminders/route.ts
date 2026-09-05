import { and, eq, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendReminderEmail } from "@/lib/email";
import { sendWhatsAppMessage, formatReminderMessage } from "@/lib/whatsapp";
import { processSequenceSteps } from "@/lib/sequences";
import { recomputeOrgLeadScores } from "@/lib/scoring";

// Hit by an external cron (or Vercel Cron) with:
//   GET /api/cron/reminders (header: Authorization: Bearer <CRON_SECRET>)
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Auth: shared secret header.
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return new Response("CRON_SECRET not configured", { status: 500 });
  }
  const expected = `Bearer ${cronSecret}`;
  if (authHeader !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const now = new Date();

  // Process sequence steps FIRST, so newly-created reminders (e.g. delayDays: 0)
  // are picked up in the same cron run, not the next one.
  const seqResult = await processSequenceSteps();

  // Find pending reminders due now or earlier that haven't been sent.
  const due = await db
    .select({
      reminderId: schema.reminders.id,
      leadId: schema.reminders.leadId,
      orgId: schema.reminders.orgId,
      assigneeId: schema.reminders.assigneeId,
      dueAt: schema.reminders.dueAt,
      note: schema.reminders.note,
      leadName: schema.leads.name,
      leadCompany: schema.leads.company,
      leadPhone: schema.leads.phone,
      assigneeEmail: schema.users.email,
      orgName: schema.organizations.name,
      whatsappConfig: schema.organizations.whatsappConfig,
    })
    .from(schema.reminders)
    .innerJoin(schema.leads, eq(schema.reminders.leadId, schema.leads.id))
    .leftJoin(schema.users, eq(schema.reminders.assigneeId, schema.users.id))
    .leftJoin(schema.organizations, eq(schema.reminders.orgId, schema.organizations.id))
    .where(
      and(
        eq(schema.reminders.status, "pending"),
        lte(schema.reminders.dueAt, now),
      ),
    )
    .limit(100);

  let sent = 0;
  let failed = 0;
  let whatsappSent = 0;

  for (const r of due) {
    let didSend = false;

    // Try WhatsApp first if configured and lead has a phone.
    if (r.whatsappConfig && (r.whatsappConfig as any)?.enabled && r.leadPhone) {
      const msg = formatReminderMessage(
        r.leadName,
        r.note || "Follow-up due",
        r.orgName || "Xsta360",
      );
      const result = await sendWhatsAppMessage(
        r.whatsappConfig as any,
        r.leadPhone,
        msg,
      );
      if (result.success) {
        whatsappSent++;
        didSend = true;
      }
    }

    // Also send email to the assignee.
    if (r.assigneeEmail) {
      try {
        await sendReminderEmail({
          to: r.assigneeEmail,
          leadName: r.leadName,
          leadCompany: r.leadCompany,
          dueAt: r.dueAt,
          note: r.note,
          appUrl,
        });
        didSend = true;
      } catch (err) {
        // Email failed — but WhatsApp may have succeeded.
        if (!didSend) {
          const message = err instanceof Error ? err.message : "Unknown error";
          await db
            .update(schema.reminders)
            .set({ status: "failed", lastError: message, updatedAt: now })
            .where(eq(schema.reminders.id, r.reminderId));
          failed++;
          continue;
        }
      }
    }

    if (didSend) {
      await db
        .update(schema.reminders)
        .set({ status: "sent", lastError: null, updatedAt: now })
        .where(eq(schema.reminders.id, r.reminderId));
      sent++;
    } else if (!r.assigneeEmail) {
      await db
        .update(schema.reminders)
        .set({ status: "failed", lastError: "Assignee has no email and WhatsApp not configured", updatedAt: now })
        .where(eq(schema.reminders.id, r.reminderId));
      failed++;
    }
  }

  // Recompute lead scores for all orgs with due reminders.
  const orgIds = [...new Set(due.map((r) => r.orgId))];
  let scoresUpdated = 0;
  for (const orgId of orgIds) {
    scoresUpdated += await recomputeOrgLeadScores(orgId);
  }

  return Response.json({
    sent,
    failed,
    whatsappSent,
    checked: due.length,
    sequenceSteps: seqResult.processed,
    sequenceEmails: seqResult.emailsSent,
    sequenceWhatsapp: seqResult.whatsappSent,
    sequenceReminders: seqResult.remindersCreated,
    sequenceSkippedWindow: seqResult.skippedWindow,
    scoresUpdated,
  });
}
