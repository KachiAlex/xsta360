import { and, eq, isNull } from "drizzle-orm";
import { timingSafeEqual } from "crypto";
import { db, schema } from "@/db";
import { sendTeamReportEmail } from "@/lib/email";
import { isSubscriptionBlocked } from "@/lib/dal";
import { getTeamReport } from "@/lib/team-report";
import { getPipelineForecast } from "@/lib/forecast";
import { startOfDayForDate } from "@/lib/timezone";

export const dynamic = "force-dynamic";

/**
 * Team activity report cron.
 * Hit with: GET /api/cron/team-report (header: Authorization: Bearer <CRON_SECRET>)
 *
 * Sends each organization's workspace admins a team scorecard email:
 *  - daily:  covers yesterday (org-local), sent once local time is past 7am
 *  - weekly: covers the previous Mon–Sun, sent on local Monday (past 7am)
 *
 * Deliveries are claimed in `team_report_deliveries` before sending so
 * repeated invocations never double-send; a fully-failed send releases
 * the claim so the next run retries.
 */

// Send window: reports go out once the org's local time reaches this hour.
const SEND_HOUR = 7;

interface LocalParts {
  year: number;
  month: number; // 0-based
  day: number;
  hour: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

function getLocalParts(timezone: string, at: Date): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: +get("year"),
    month: +get("month") - 1,
    day: +get("day"),
    hour: +get("hour") % 24,
    weekday: weekdayMap[get("weekday")] ?? 0,
  };
}

function fmtDay(timezone: string, y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m, d, 12)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Shift a local (y, m, d) by deltaDays using noon-UTC anchoring (DST-safe). */
function shiftLocalDate(y: number, m: number, d: number, deltaDays: number) {
  const shifted = new Date(Date.UTC(y, m, d + deltaDays, 12));
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate() };
}

export async function GET(request: Request) {
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

  const orgs = await db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      currency: schema.organizations.currency,
      timezone: schema.organizations.timezone,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.teamReportEmails, true));

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const org of orgs) {
    try {
      const tz = org.timezone ?? "Africa/Lagos";
      const local = getLocalParts(tz, now);
      if (local.hour < SEND_HOUR || (await isSubscriptionBlocked(org.id))) {
        skipped++;
        continue;
      }

      // Workspace admins only.
      const admins = await db
        .select({ email: schema.users.email, name: schema.users.name })
        .from(schema.memberships)
        .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
        .where(
          and(
            eq(schema.memberships.orgId, org.id),
            eq(schema.memberships.role, "admin"),
            isNull(schema.users.suspendedAt),
          ),
        );
      if (admins.length === 0) {
        skipped++;
        continue;
      }

      // Which reports are due right now?
      const due: { type: "daily" | "weekly"; periodKey: string; from: Date; to: Date; rangeLabel: string }[] = [];

      // Daily — covers yesterday (org-local).
      const yd = shiftLocalDate(local.year, local.month, local.day, -1);
      due.push({
        type: "daily",
        periodKey: `daily:${yd.y}-${String(yd.m + 1).padStart(2, "0")}-${String(yd.d).padStart(2, "0")}`,
        from: startOfDayForDate(tz, yd.y, yd.m, yd.d),
        to: startOfDayForDate(tz, local.year, local.month, local.day),
        rangeLabel: fmtDay(tz, yd.y, yd.m, yd.d),
      });

      // Weekly — Mondays only, covers the previous Mon–Sun.
      if (local.weekday === 1) {
        const weekEnd = shiftLocalDate(local.year, local.month, local.day, -1); // Sunday
        const weekStart = shiftLocalDate(local.year, local.month, local.day, -7); // prior Monday
        due.push({
          type: "weekly",
          periodKey: `weekly:${weekStart.y}-${String(weekStart.m + 1).padStart(2, "0")}-${String(weekStart.d).padStart(2, "0")}`,
          from: startOfDayForDate(tz, weekStart.y, weekStart.m, weekStart.d),
          to: startOfDayForDate(tz, local.year, local.month, local.day),
          rangeLabel: `${fmtDay(tz, weekStart.y, weekStart.m, weekStart.d)} – ${fmtDay(tz, weekEnd.y, weekEnd.m, weekEnd.d)}`,
        });
      }

      for (const report of due) {
        // Claim the delivery first — unique constraint makes this atomic.
        const claim = await db
          .insert(schema.teamReportDeliveries)
          .values({ orgId: org.id, reportType: report.type, periodKey: report.periodKey })
          .onConflictDoNothing()
          .returning({ id: schema.teamReportDeliveries.id });
        if (claim.length === 0) continue; // already delivered/claimed

        const reportData = await getTeamReport(org.id, { from: report.from, to: report.to });

        // Quiet-day policy: daily email only if anything happened.
        if (
          report.type === "daily" &&
          reportData.totals.newLeads === 0 &&
          reportData.totals.activitiesLogged === 0 &&
          reportData.totals.remarksLogged === 0 &&
          reportData.totals.stageMoves === 0 &&
          reportData.totals.won === 0 &&
          reportData.totals.lost === 0 &&
          reportData.totals.remindersDone === 0 &&
          reportData.totals.remindersOverdue === 0
        ) {
          skipped++;
          continue; // claim stays — period recorded, won't reprocess
        }

        const pipeline =
          report.type === "weekly"
            ? await getPipelineForecast(org.id)
            : undefined;

        let delivered = 0;
        let anyError = false;
        for (const admin of admins) {
          try {
            await sendTeamReportEmail({
              to: admin.email,
              userName: admin.name,
              orgName: org.name,
              period: report.type,
              rangeLabel: report.rangeLabel,
              members: reportData.members.map((m) => ({
                name: m.name,
                activitiesLogged: m.activitiesLogged,
                remarksLogged: m.remarksLogged,
                remindersDone: m.remindersDone,
                remindersOverdue: m.remindersOverdue,
                stageMoves: m.stageMoves,
                won: m.won,
                lost: m.lost,
              })),
              totals: reportData.totals,
              highlights: reportData.highlights,
              pipeline: pipeline
                ? {
                    openValue: pipeline.totalPipelineValue,
                    weightedValue: pipeline.totalWeightedValue,
                    wonValue: pipeline.wonValue,
                  }
                : undefined,
              currency: org.currency,
              appUrl,
            });
            delivered++;
          } catch (err) {
            anyError = true;
            console.error(`[team-report] send failed for org ${org.id} → ${admin.email}:`, err);
          }
        }

        if (delivered === 0 && anyError) {
          // Total failure — release the claim so the next run retries.
          await db
            .delete(schema.teamReportDeliveries)
            .where(eq(schema.teamReportDeliveries.id, claim[0].id));
          failed++;
          continue;
        }

        await db
          .update(schema.teamReportDeliveries)
          .set({ recipients: delivered })
          .where(eq(schema.teamReportDeliveries.id, claim[0].id));
        sent++;
      }
    } catch (err) {
      failed++;
      console.error(`[team-report] org ${org.id} failed:`, err);
    }
  }

  return Response.json({ sent, skipped, failed, orgs: orgs.length });
}
