"use server";

import { verifyActiveSession, getOrgPlan, planHasFeature } from "@/lib/dal";
import { getSourceReport, getRepReport } from "@/lib/reports";
import { getPipelineForecast } from "@/lib/forecast";
import { getTeamReport, getActivityFeed, getOrgTimezone, EVENT_LABELS } from "@/lib/team-report";
import { startOfDayInZone } from "@/lib/timezone";

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function line(...cells: (string | number)[]): string {
  return cells.map((c) => escapeCsv(String(c))).join(",");
}

export type ReportRange = "today" | "7d" | "30d";

/**
 * Export everything on /reports as one sectioned CSV. Same data + same range
 * window as the page, gated on the `reports` plan feature the same way.
 */
export async function exportReport(
  range: string,
): Promise<{ csv: string; filename: string } | { error: string }> {
  const ctx = await verifyActiveSession();
  if (!ctx) return { error: "Not signed in" };

  const plan = await getOrgPlan(ctx.orgId);
  if (!planHasFeature(plan, "reports")) {
    return { error: "Reports aren't included in your plan" };
  }

  const valid: ReportRange = range === "today" || range === "30d" ? range : "7d";
  const timezone = await getOrgTimezone(ctx.orgId);
  const now = new Date();
  const from =
    valid === "today"
      ? startOfDayInZone(timezone)
      : new Date(now.getTime() - (valid === "30d" ? 30 : 7) * 24 * 60 * 60 * 1000);
  const window = { from, to: now };

  const [sourceReport, repReport, forecast, teamReport, feed] = await Promise.all([
    getSourceReport(ctx.orgId),
    getRepReport(ctx.orgId),
    getPipelineForecast(ctx.orgId),
    getTeamReport(ctx.orgId, window),
    getActivityFeed(ctx.orgId, window, undefined, 500),
  ]);

  const SOURCE_LABELS: Record<string, string> = {
    referral: "Referral",
    social: "Social",
    ad: "Ad campaign",
    walk_in: "Walk-in",
    embedded_form: "Website form",
    other: "Other",
  };

  const lines: string[] = [];
  const dateFmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: timezone });

  lines.push(`Xsta360 report — ${valid} (${dateFmt(from)} - ${dateFmt(now)})`);
  lines.push(`Generated ${now.toISOString()}`);
  lines.push("");

  // ── Team activity scorecard ──
  lines.push("TEAM ACTIVITY");
  lines.push(
    line(
      "Member", "Role", "Leads assigned", "Leads created", "Activities",
      "Calls", "Emails", "Meetings", "Notes", "Visits",
      "Remarks", "Follow-ups done", "Overdue", "Stage moves",
      "Won", "Won value (NGN)", "Lost", "Lost value (NGN)", "To-dos done",
    ),
  );
  for (const m of teamReport.members) {
    const b = m.activityBreakdown;
    lines.push(
      line(
        m.name, m.role, m.leadsAssigned, m.leadsCreated, m.activitiesLogged,
        b.call ?? 0, b.email ?? 0, b.meeting ?? 0, b.note ?? 0, b.visit ?? 0,
        m.remarksLogged, m.remindersDone, m.remindersOverdue, m.stageMoves,
        m.won, m.wonValue, m.lost, m.lostValue, m.todosDone,
      ),
    );
  }
  const t = teamReport.totals;
  lines.push(
    line(
      "TOTAL", "", "", t.newLeads, t.activitiesLogged,
      "", "", "", "", "",
      t.remarksLogged, t.remindersDone, t.remindersOverdue, t.stageMoves,
      t.won, t.wonValue, t.lost, t.lostValue, "",
    ),
  );
  lines.push("");

  // ── Highlights ──
  const h = teamReport.highlights;
  if (h.topWin || h.lostDeals.length || h.inactiveMembers.length || h.quietLeads.length) {
    lines.push("HIGHLIGHTS");
    if (h.topWin) {
      lines.push(line("Top win", `${h.topWin.repName} closed ${h.topWin.leadName}`, h.topWin.value));
    }
    for (const d of h.lostDeals) {
      lines.push(line("Lost deal", `${d.leadName} (${d.repName})`, d.value));
    }
    for (const name of h.inactiveMembers) {
      lines.push(line("No activity", name));
    }
    for (const q of h.quietLeads) {
      lines.push(line("Quiet lead", `${q.leadName} — ${q.daysQuiet} days untouched (${q.repName})`));
    }
    lines.push("");
  }

  // ── Pipeline forecast ──
  lines.push("PIPELINE FORECAST");
  lines.push(line("Stage", "Kind", "Leads", "Probability %", "Total value (NGN)", "Weighted (NGN)"));
  for (const s of forecast.stages) {
    lines.push(line(s.stageName, s.stageKind, s.leadCount, s.probability, s.totalValue, s.weightedValue));
  }
  lines.push(line("TOTALS", "", forecast.totalLeads, "", forecast.totalPipelineValue, forecast.totalWeightedValue));
  lines.push(line("Won (all-time)", "", "", "", forecast.wonValue, ""));
  lines.push("");

  // ── Source attribution ──
  lines.push("SOURCE ATTRIBUTION");
  lines.push(line("Source", "Leads", "Won", "Lost", "Conversion %"));
  for (const s of sourceReport) {
    lines.push(line(SOURCE_LABELS[s.source] ?? s.source, s.total, s.won, s.lost, s.conversionRate));
  }
  lines.push("");

  // ── Per-rep performance (all-time, same as page) ──
  lines.push("TEAM PERFORMANCE (ALL-TIME)");
  lines.push(line("Rep", "Leads", "Overdue", "Won", "Lost", "Win rate %"));
  for (const r of repReport) {
    lines.push(line(r.name, r.totalLeads, r.overdue, r.won, r.lost, r.winRate));
  }
  lines.push("");

  // ── Activity log ──
  lines.push("ACTIVITY LOG");
  lines.push(line("Time", "Actor", "Event", "Lead", "Detail"));
  for (const e of feed) {
    const detail =
      e.type === "stage_changed" && (e.meta?.toStageName ?? e.meta?.toStage) != null
        ? `→ ${String(e.meta?.toStageName ?? e.meta?.toStage)}`
        : "";
    lines.push(
      line(
        e.at.toISOString(),
        e.actorName,
        EVENT_LABELS[e.type] ?? e.type.replace(/_/g, " "),
        e.leadName ?? "",
        detail,
      ),
    );
  }

  const stamp = now.toISOString().split("T")[0];
  return { csv: lines.join("\n"), filename: `xsta360-report-${valid}-${stamp}.csv` };
}
