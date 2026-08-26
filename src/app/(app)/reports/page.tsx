import { requireAuth } from "@/lib/dal";
import { getSourceReport, getRepReport } from "@/lib/reports";
import { Topbar } from "@/components/app/topbar";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/app/empty-state";

const SOURCE_LABELS: Record<string, string> = {
  referral: "Referral",
  social: "Social",
  ad: "Ad campaign",
  walk_in: "Walk-in",
  embedded_form: "Website form",
  other: "Other",
};

export default async function ReportsPage() {
  const ctx = await requireAuth();
  const [sourceReport, repReport] = await Promise.all([
    getSourceReport(ctx.orgId),
    getRepReport(ctx.orgId),
  ]);

  return (
    <>
      <Topbar />
      <div className="content flex-1 px-8 py-7 max-w-[1240px] w-full mx-auto space-y-6">
        <h1 className="font-mono text-xl">Reports</h1>

        {/* Source attribution */}
        <Panel>
          <PanelHead title="Source attribution" sub="Lead count & conversion by source" />
          {sourceReport.length === 0 ? (
            <EmptyState title="No leads to report on yet" description="Add leads with a source tag to see conversion by channel here." />
          ) : (
            <table className="w-full border-collapse">
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
          )}
        </Panel>

        {/* Manager dashboard: per-rep stats */}
        <Panel>
          <PanelHead title="Team performance" sub="Per-rep follow-up discipline & win rate" />
          {repReport.length === 0 ? (
            <EmptyState title="No team members yet" description="Invite teammates to see per-rep stats here." />
          ) : (
            <table className="w-full border-collapse">
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
          )}
        </Panel>
      </div>
    </>
  );
}
