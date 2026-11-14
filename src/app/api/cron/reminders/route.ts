import { and, eq, lte, or } from "drizzle-orm";
import { timingSafeEqual } from "crypto";
import { db, schema } from "@/db";
import { isSubscriptionBlocked } from "@/lib/dal";
import { sendReminderEmail } from "@/lib/email";
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
  const authBuf = Buffer.from(authHeader ?? "");
  const expBuf = Buffer.from(expected);
  if (
    typeof authHeader !== "string" ||
    authBuf.length !== expBuf.length ||
    !timingSafeEqual(authBuf, expBuf)
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const now = new Date();

  try {
    // Process sequence steps FIRST, so newly-created reminders (e.g. delayDays: 0)
    // are picked up in the same cron run, not the next one. Isolated in its own
    // try/catch — a sequence bug must not take down reminder delivery too.
    let seqResult = {
      processed: 0,
      emailsSent: 0,
      whatsappSent: 0,
      remindersCreated: 0,
      skippedWindow: 0,
      quotaHeld: 0,
    };
    try {
      seqResult = await processSequenceSteps();
    } catch (err) {
      console.error("Sequence step processing failed:", err);
    }

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
      assigneeEmail: schema.users.email,
      orgName: schema.organizations.name,
      memberActive: schema.memberships.id,
    })
    .from(schema.reminders)
    .innerJoin(schema.leads, eq(schema.reminders.leadId, schema.leads.id))
    .leftJoin(schema.users, eq(schema.reminders.assigneeId, schema.users.id))
    .leftJoin(
      schema.memberships,
      and(
        eq(schema.memberships.userId, schema.reminders.assigneeId),
        eq(schema.memberships.orgId, schema.reminders.orgId),
      ),
    )
    .leftJoin(schema.organizations, eq(schema.reminders.orgId, schema.organizations.id))
    .where(
      or(
        and(eq(schema.reminders.status, "pending"), lte(schema.reminders.dueAt, now)),
        and(
          eq(schema.reminders.status, "processing"),
          lte(schema.reminders.updatedAt, new Date(now.getTime() - 10 * 60 * 1000)),
        ),
      ),
    )
    .limit(100);

  // Skip reminders belonging to blocked orgs (lapsed/canceled subscription)
  // — a locked-out tenant shouldn't keep sending follow-up emails/WhatsApps.
  const dueOrgIds = [...new Set(due.map((r) => r.orgId))];
  const blockedOrgIds = new Set<string>();
  for (const orgId of dueOrgIds) {
    if (await isSubscriptionBlocked(orgId)) blockedOrgIds.add(orgId);
  }

  // Atomically claim due reminders by setting status to "processing".
  const claimed: typeof due = [];
  for (const r of due) {
    if (blockedOrgIds.has(r.orgId)) continue;
    const [updated] = await db
      .update(schema.reminders)
      .set({ status: "processing", updatedAt: now })
      .where(
        and(
          eq(schema.reminders.id, r.reminderId),
          eq(schema.reminders.status, "pending"),
        ),
      )
      .returning();
    if (updated) claimed.push(r);
  }

  let sent = 0;
  let failed = 0;

  for (const r of claimed) {
    // Skip if the reminder has no assignee.
    if (!r.assigneeId) {
      await db
        .update(schema.reminders)
        .set({ status: "failed", lastError: "Reminder has no assignee", updatedAt: now })
        .where(eq(schema.reminders.id, r.reminderId));
      failed++;
      continue;
    }

    // Skip if the assignee is no longer a member of this org.
    if (!r.memberActive) {
      await db
        .update(schema.reminders)
        .set({ status: "failed", lastError: "Assignee is no longer a member of this organization", updatedAt: now })
        .where(eq(schema.reminders.id, r.reminderId));
      failed++;
      continue;
    }

    let didSend = false;

    // Reminders go to the assignee by email. They intentionally do NOT go to
    // the lead's WhatsApp — the note is internal rep-facing content and would
    // leak to the customer.
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
            .set({ status: "pending", lastError: message, updatedAt: now })
            .where(eq(schema.reminders.id, r.reminderId));
          failed++;
          continue;
        }
      }
    }

    if (didSend) {
      await db
        .update(schema.reminders)
        .set({
          status: "sent",
          sentAt: now,
          lastError: null,
          updatedAt: now,
        })
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
  const orgIds = [...new Set(claimed.map((r) => r.orgId))];
  let scoresUpdated = 0;
  for (const orgId of orgIds) {
    scoresUpdated += await recomputeOrgLeadScores(orgId);
  }

  return Response.json({
    sent,
    failed,
    checked: claimed.length,
    sequenceSteps: seqResult.processed,
    sequenceEmails: seqResult.emailsSent,
    sequenceWhatsapp: seqResult.whatsappSent,
    sequenceReminders: seqResult.remindersCreated,
    sequenceSkippedWindow: seqResult.skippedWindow,
    sequenceQuotaHeld: seqResult.quotaHeld,
    scoresUpdated,
  });
  } catch (err) {
    console.error("Cron reminders error:", err);
    return Response.json({ error: "Cron processing failed" }, { status: 500 });
  }
}
