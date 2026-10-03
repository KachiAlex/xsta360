import Link from "next/link";
import { requireAuth, getOrgPlan, planHasFeature } from "@/lib/dal";
import { UpgradePrompt } from "@/components/app/upgrade-prompt";
import { getSourceReport, getRepReport } from "@/lib/reports";
import { getPipelineForecast, formatCurrency } from "@/lib/forecast";
import { getTeamReport, getActivityFeed, getOrgTimezone, EVENT_LABELS } from "@/lib/team-report";
import { startOfDayInZone } from "@/lib/timezone";
import { Topbar } from "@/components/app/topbar";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/app/empty-state";
import { ExportReportButton } from "@/components/app/export-report-button";

const SOURCE_LABELS: Record<string, string> = {
  referral: "Referral",
  social: "Social",
  ad: "Ad campaign",
  walk_in: "Walk-in",
  embedded_form: "Website form",
  other: "Other",
};

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
] as const;

function timeAgo(at: Date): string {
  const mins = Math.floor((Date.now() - at.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const ctx = await requireAuth();
  const plan = await getOrgPlan(ctx.orgId);
  if (!planHasFeature(plan, "reports")) {
    return <UpgradePrompt feature="reports" plan={plan} />;
  }

  const { range = "7d" } = await searchParams;
  const timezone = await getOrgTimezone(ctx.orgId);
  const now = new Date();
  const from =
    range === "today"
      ? startOfDayInZone(timezone)
      : new Date(now.getTime() - (range === "30d" ? 30 : 7) * 24 * 60 * 60 * 1000);
  const window = { from, to: now };

  const [sourceReport, repReport, forecast, teamReport, feed] = await Promise.all([
    getSourceReport(ctx.orgId),
    getRepReport(ctx.orgId),
    getPipelineForecast(ctx.orgId),
    getTeamReport(ctx.orgId, window),
    getActivityFeed(ctx.orgId, window, undefined, 60),
  ]);

  return (
    <>
      <Topbar />
      <div className="content flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-7 max-w-[1240px] w-full mx-auto space-y-4 sm:space-y-6">
        <h1 className="font-mono text-xl">Reports</h1>

        {/* Team activity — period scorecards + live feed */}
        <Panel>
          <PanelHead
            title="Team activity"
            sub="What each member has been doing in the selected period"
          />
          <div className="px-5 pt-4 flex flex-wrap items-center gap-1.5">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={`/reports?range=${r.key}`}
                className={`font-mono text-[11px] px-3 py-1.5 rounded border transition-colors ${
                  range === r.key
                    ? "bg-ink text-paper border-ink"
                    : "bg-paper border-rule text-ink-soft hover:border-ink/40"
                }`}
              >
                {r.label}
              </Link>
            ))}
            <span className="ml-auto">
              <ExportReportButton range={range} />
            </span>
          </div>

          <div className="p-4 sm:p-5">
            {/* Period totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-5">
              <div className="bg-paper-2 rounded p-2.5 sm:p-3">
                <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-ink-soft mb-1">New leads</div>
                <div className="font-mono text-base sm:text-xl font-bold">{teamReport.totals.newLeads}</div>
              </div>
              <div className="bg-paper-2 rounded p-2.5 sm:p-3">
                <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-ink-soft mb-1">Activities</div>
                <div className="font-mono text-base sm:text-xl font-bold">{teamReport.totals.activitiesLogged}</div>
              </div>
              <div className="bg-paper-2 rounded p-2.5 sm:p-3">
                <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-ink-soft mb-1">Won</div>
                <div className="font-mono text-base sm:text-xl font-bold text-register">
                  {teamReport.totals.won}
                  {teamReport.totals.wonValue > 0 && (
                    <span className="text-xs font-normal ml-1">({formatCurrency(teamReport.totals.wonValue)})</span>
                  )}
                </div>
              </div>
              <div className="bg-paper-2 rounded p-2.5 sm:p-3">
                <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-ink-soft mb-1">Overdue</div>
                <div className={`font-mono text-base sm:text-xl font-bold ${teamReport.totals.remindersOverdue > 0 ? "text-stamp" : ""}`}>
                  {teamReport.totals.remindersOverdue}
                </div>
              </div>
            </div>

            {/* Highlights */}
            {(teamReport.highlights.topWin ||
              teamReport.highlights.lostDeals.length > 0 ||
              teamReport.highlights.inactiveMembers.length > 0 ||
              teamReport.highlights.quietLeads.length > 0) && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {teamReport.highlights.topWin && (
                  <Badge tone="won">
                    🏆 {teamReport.highlights.topWin.repName} closed {teamReport.highlights.topWin.leadName}
                    {teamReport.highlights.topWin.value > 0 && ` · ${formatCurrency(teamReport.highlights.topWin.value)}`}
                  </Badge>
                )}
                {teamReport.highlights.lostDeals.map((d) => (
                  <Badge key={d.leadName} tone="lost">
                    Lost {d.leadName} ({d.repName}){d.value > 0 && ` · ${formatCurrency(d.value)}`}
                  </Badge>
                ))}
                {teamReport.highlights.inactiveMembers.map((name) => (
                  <Badge key={name} tone="later">No activity: {name}</Badge>
                ))}
                {teamReport.highlights.quietLeads.map((q) => (
                  <Link key={q.leadId} href={`/leads/${q.leadId}`}>
                    <Badge tone="later">{q.leadName} quiet {q.daysQuiet}d ({q.repName})</Badge>
                  </Link>
                ))}
              </div>
            )}

            {/* Scorecard */}
            {teamReport.members.length === 0 ? (
              <EmptyState title="No team members yet" description="Invite teammates to see activity here." />
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[640px]">
                <thead>
                  <tr>
                    <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft py-2 border-b border-rule font-semibold">Member</th>
                    <th className="text-right font-mono text-[11px] uppercase tracking-wider text-ink-soft py-2 border-b border-rule font-semibold">Leads</th>
                    <th className="text-right font-mono text-[11px] uppercase tracking-wider text-ink-soft py-2 border-b border-rule font-semibold">Activities</th>
                    <th className="text-right font-mono text-[11px] uppercase tracking-wider text-ink-soft py-2 border-b border-rule font-semibold">Notes</th>
                    <th className="text-right font-mono text-[11px] uppercase tracking-wider text-ink-soft py-2 border-b border-rule font-semibold">Follow-ups</th>
                    <th className="text-right font-mono text-[11px] uppercase tracking-wider text-ink-soft py-2 border-b border-rule font-semibold">Overdue</th>
                    <th className="text-right font-mono text-[11px] uppercase tracking-wider text-ink-soft py-2 border-b border-rule font-semibold">Moves</th>
                    <th className="text-right font-mono text-[11px] uppercase tracking-wider text-ink-soft py-2 border-b border-rule font-semibold">Won</th>
                    <th className="text-right font-mono text-[11px] uppercase tracking-wider text-ink-soft py-2 border-b border-rule font-semibold">Lost</th>
                  </tr>
                </thead>
                <tbody>
                  {teamReport.members.map((m) => (
                    <tr key={m.userId} className="hover:bg-paper-2">
                      <td className="py-3 border-b border-dashed border-rule font-semibold">
                        {m.name}
                        <span className="ml-2 text-[10px] font-mono text-ink-soft">{m.role}</span>
                      </td>
                      <td className="py-3 border-b border-dashed border-rule font-mono text-right">{m.leadsAssigned}</td>
                      <td className="py-3 border-b border-dashed border-rule font-mono text-right">
                        {m.activitiesLogged}
                        {m.activitiesLogged > 0 && (
                          <span className="block text-[10px] text-ink-soft">
                            {Object.entries(m.activityBreakdown)
                              .filter(([, n]) => n > 0)
                              .map(([t, n]) => `${n} ${t}${n !== 1 ? "s" : ""}`)
                              .join(" · ")}
                          </span>
                        )}
                      </td>
                      <td className="py-3 border-b border-dashed border-rule font-mono text-right">{m.remarksLogged}</td>
                      <td className="py-3 border-b border-dashed border-rule font-mono text-right">{m.remindersDone}</td>
                      <td className="py-3 border-b border-dashed border-rule font-mono text-right">
                        {m.remindersOverdue > 0 ? <span className="text-stamp font-bold">{m.remindersOverdue}</span> : "0"}
                      </td>
                      <td className="py-3 border-b border-dashed border-rule font-mono text-right">{m.stageMoves}</td>
                      <td className="py-3 border-b border-dashed border-rule font-mono text-right text-register font-bold">{m.won || "—"}</td>
                      <td className={`py-3 border-b border-dashed border-rule font-mono text-right ${m.lost > 0 ? "text-stamp" : ""}`}>{m.lost || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>

          {/* Activity feed */}
          <div className="border-t border-rule">
            <div className="px-5 pt-4 pb-2 font-mono text-[11px] uppercase tracking-wider text-ink-soft">
              Activity log
            </div>
            {feed.length === 0 ? (
              <div className="px-5 pb-5 text-sm text-ink-soft">No team activity in this period.</div>
            ) : (
              <ul className="px-5 pb-5 space-y-2">
                {feed.map((e) => (
                  <li key={e.id} className="text-sm flex items-baseline gap-2">
                    <span className="font-mono text-[10px] text-ink-soft shrink-0 w-16">{timeAgo(e.at)}</span>
                    <span>
                      <strong>{e.actorName}</strong> {EVENT_LABELS[e.type] ?? e.type.replace(/_/g, " ")}
                      {e.leadId && e.leadName && (
                        <>
                          {" "}
                          <Link href={`/leads/${e.leadId}`} className="text-stamp underline underline-offset-2">
                            {e.leadName}
                          </Link>
                        </>
                      )}
                      {e.type === "stage_changed" && (e.meta?.toStageName ?? e.meta?.toStage) != null && (
                        <span className="text-ink-soft"> → {String(e.meta?.toStageName ?? e.meta?.toStage)}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>

        {/* Pipeline forecast */}
        <Panel>
          <PanelHead title="Pipeline forecast" sub="Deal value by stage, weighted by win probability" />
          <div className="p-4 sm:p-5">
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-4 sm:mb-5">
              <div className="bg-paper-2 rounded p-2.5 sm:p-3">
                <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-ink-soft mb-1">Pipeline value</div>
                <div className="font-mono text-base sm:text-xl font-bold">{formatCurrency(forecast.totalPipelineValue)}</div>
              </div>
              <div className="bg-paper-2 rounded p-2.5 sm:p-3">
                <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-ink-soft mb-1">Weighted forecast</div>
                <div className="font-mono text-base sm:text-xl font-bold text-register">{formatCurrency(forecast.totalWeightedValue)}</div>
              </div>
              <div className="bg-paper-2 rounded p-2.5 sm:p-3">
                <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-ink-soft mb-1">Won (all-time)</div>
                <div className="font-mono text-base sm:text-xl font-bold text-register">{formatCurrency(forecast.wonValue)}</div>
              </div>
              <div className="bg-paper-2 rounded p-2.5 sm:p-3">
                <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-wider text-ink-soft mb-1">Open leads</div>
                <div className="font-mono text-base sm:text-xl font-bold">{forecast.totalLeads}</div>
              </div>
            </div>

            {/* Per-stage table */}
            <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[500px]">
              <thead>
                <tr>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft py-2 border-b border-rule font-semibold">Stage</th>
                  <th className="text-right font-mono text-[11px] uppercase tracking-wider text-ink-soft py-2 border-b border-rule font-semibold">Leads</th>
                  <th className="text-right font-mono text-[11px] uppercase tracking-wider text-ink-soft py-2 border-b border-rule font-semibold">Probability</th>
                  <th className="text-right font-mono text-[11px] uppercase tracking-wider text-ink-soft py-2 border-b border-rule font-semibold">Total value</th>
                  <th className="text-right font-mono text-[11px] uppercase tracking-wider text-ink-soft py-2 border-b border-rule font-semibold">Weighted</th>
                </tr>
              </thead>
              <tbody>
                {forecast.stages.map((row) => (
                  <tr key={row.stageId} className="hover:bg-paper-2">
                    <td className="py-3 border-b border-dashed border-rule font-semibold">
                      {row.stageName}
                      <span className={`ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        row.stageKind === "won" ? "bg-register/12 text-register"
                        : row.stageKind === "lost" ? "bg-stamp/12 text-stamp-deep"
                        : "bg-paper-2 text-ink-soft"
                      }`}>{row.stageKind}</span>
                    </td>
                    <td className="py-3 border-b border-dashed border-rule font-mono text-right">{row.leadCount}</td>
                    <td className="py-3 border-b border-dashed border-rule font-mono text-right">{row.probability}%</td>
                    <td className="py-3 border-b border-dashed border-rule font-mono text-right">{formatCurrency(row.totalValue)}</td>
                    <td className="py-3 border-b border-dashed border-rule font-mono text-right font-bold">{formatCurrency(row.weightedValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </Panel>

        {/* Source attribution */}
        <Panel>
          <PanelHead title="Source attribution" sub="Lead count & conversion by source" />
          {sourceReport.length === 0 ? (
            <EmptyState title="No leads to report on yet" description="Add leads with a source tag to see conversion by channel here." />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[400px]">
              <thead>
                <tr>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Source</th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Leads</th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Won</th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Lost</th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {sourceReport.map((row) => (
                  <tr key={row.source} className="hover:bg-paper-2">
                    <td className="px-5 py-3.5 border-b border-dashed border-rule font-semibold">
                      {SOURCE_LABELS[row.source] ?? row.source}
                    </td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule font-mono">{row.total}</td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule font-mono text-register">{row.won}</td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule font-mono text-stamp">{row.lost}</td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule">
                      <Badge tone={row.conversionRate >= 30 ? "won" : row.conversionRate >= 15 ? "today" : "later"}>
                        {row.conversionRate}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Panel>

        {/* Manager dashboard: per-rep stats */}
        <Panel>
          <PanelHead title="Team performance" sub="Per-rep follow-up discipline & win rate" />
          {repReport.length === 0 ? (
            <EmptyState title="No team members yet" description="Invite teammates to see per-rep stats here." />
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[400px]">
              <thead>
                <tr>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Rep</th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Leads</th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Overdue</th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Won</th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">Win rate</th>
                </tr>
              </thead>
              <tbody>
                {repReport.map((r) => (
                  <tr key={r.userId} className="hover:bg-paper-2">
                    <td className="px-5 py-3.5 border-b border-dashed border-rule font-semibold">{r.name}</td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule font-mono">{r.totalLeads}</td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule font-mono">
                      {r.overdue > 0 ? <span className="text-stamp">{r.overdue}</span> : "0"}
                    </td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule font-mono text-register">{r.won}</td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule">
                      <Badge tone={r.winRate >= 30 ? "won" : r.winRate >= 15 ? "today" : "later"}>
                        {r.winRate}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
