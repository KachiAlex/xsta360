import { and, eq, lte } from "drizzle-orm";
import { db, schema } from "@/db";
import { sendDigestEmail } from "@/lib/email";
import { getDashboardStats } from "@/lib/dashboard";
import { getTaskSummary } from "@/lib/tasks";
import { getPipelineForecast } from "@/lib/forecast";

export const dynamic = "force-dynamic";

/**
 * Daily digest email cron.
 * Hit with: GET /api/cron/digest (header: Authorization: Bearer <CRON_SECRET>)
 *
 * Sends a summary email to every user with pending follow-ups or to-dos.
 */
export async function GET(request: Request) {
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
  const sod = new Date(now);
  sod.setHours(0, 0, 0, 0);
  const eod = new Date(now);
  eod.setHours(23, 59, 59, 999);

  // Get all users with memberships (active org members).
  const members = await db
    .select({
      userId: schema.memberships.userId,
      orgId: schema.memberships.orgId,
      userName: schema.users.name,
      email: schema.users.email,
      orgName: schema.organizations.name,
      currency: schema.organizations.currency,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .innerJoin(schema.organizations, eq(schema.memberships.orgId, schema.organizations.id));

  let sent = 0;
  let skipped = 0;

  for (const m of members) {
    // Get stats for this user.
    const [stats, taskSummary, forecast] = await Promise.all([
      getDashboardStats(m.orgId, m.userId),
      getTaskSummary(m.orgId, m.userId),
      getPipelineForecast(m.orgId),
    ]);

    // Skip if nothing actionable.
    if (stats.overdue === 0 && stats.dueToday === 0 && taskSummary.todosPending === 0) {
      skipped++;
      continue;
    }

    // Count quiet leads (leads with no activity in 7+ days).
    // We'll approximate using the overdue count + pending todos.
    const quietLeads = 0; // Would need a query — keeping simple for now.

    try {
      await sendDigestEmail({
        to: m.email,
        userName: m.userName,
        overdueCount: stats.overdue,
        dueTodayCount: stats.dueToday,
        pendingTodos: taskSummary.todosPending,
        quietLeads,
        totalPipelineValue: forecast.totalPipelineValue,
        currency: m.currency,
        appUrl,
      });
      sent++;
    } catch (err) {
      console.error(`[digest] Failed for ${m.email}:`, err);
    }
  }

  return Response.json({ sent, skipped, total: members.length });
}
