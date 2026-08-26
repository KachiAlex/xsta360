import { and, eq, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendReminderEmail } from "@/lib/email";

// Hit by an external cron (or Vercel Cron) with:
//   GET /api/cron/reminders (header: Authorization: Bearer <CRON_SECRET>)
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Auth: shared secret header.
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? "dev"}`;
  if (authHeader !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const now = new Date();

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
    })
    .from(schema.reminders)
    .innerJoin(schema.leads, eq(schema.reminders.leadId, schema.leads.id))
    .leftJoin(schema.users, eq(schema.reminders.assigneeId, schema.users.id))
    .where(
      and(
        eq(schema.reminders.status, "pending"),
        lte(schema.reminders.dueAt, now),
      ),
    )
    .limit(100);

  let sent = 0;
  let failed = 0;

  for (const r of due) {
    if (!r.assigneeEmail) {
      // No email on the assignee — mark failed with a reason.
      await db
        .update(schema.reminders)
        .set({ status: "failed", lastError: "Assignee has no email address", updatedAt: now })
        .where(eq(schema.reminders.id, r.reminderId));
      failed++;
      continue;
    }

    try {
      await sendReminderEmail({
        to: r.assigneeEmail,
        leadName: r.leadName,
        leadCompany: r.leadCompany,
        dueAt: r.dueAt,
        note: r.note,
        appUrl,
      });
      await db
        .update(schema.reminders)
        .set({ status: "sent", lastError: null, updatedAt: now })
        .where(eq(schema.reminders.id, r.reminderId));
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await db
        .update(schema.reminders)
        .set({ status: "failed", lastError: message, updatedAt: now })
        .where(eq(schema.reminders.id, r.reminderId));
      failed++;
    }
  }

  return Response.json({ sent, failed, checked: due.length });
}
