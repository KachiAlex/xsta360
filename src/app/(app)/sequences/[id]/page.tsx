import { requireAuth, getOrgPlan, planHasFeature } from "@/lib/dal";
import { getSequenceAnalytics } from "@/lib/sequence-analytics";
import { Topbar } from "@/components/app/topbar";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function SequenceAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireAuth();
  const plan = await getOrgPlan(ctx.orgId);
  if (!planHasFeature(plan, "sequences")) {
    return <div>Sequences not available on your plan</div>;
  }

  const { id } = await params;
  const analytics = await getSequenceAnalytics(ctx.orgId, id);

  if (!analytics) {
    return (
      <>
        <Topbar>
          <Link href="/sequences" className="px-4 py-2 text-[13.5px] font-semibold bg-panel text-ink rounded">
            ← Back to sequences
          </Link>
        </Topbar>
        <div className="content flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-7 max-w-[1240px] w-full mx-auto">
          <Panel>
            <div className="p-8 text-center text-sm text-ink-soft">Sequence not found</div>
          </Panel>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar>
        <Link href="/sequences" className="px-4 py-2 text-[13.5px] font-semibold bg-panel text-ink rounded">
          ← Sequences
        </Link>
        <span className="px-4 py-2 text-[13.5px] font-semibold bg-panel text-ink rounded shadow-[0_1px_0_var(--color-rule)]">
          {analytics.sequenceName} — Analytics
        </span>
      </Topbar>

      <div className="content flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-7 max-w-[1240px] w-full mx-auto space-y-4">
        {/* Overview stats */}
        <Panel>
          <PanelHead title="Overview" sub="Enrollment and delivery stats" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-4">
            <StatCard label="Enrolled" value={analytics.totalEnrollments} tone="neutral" />
            <StatCard label="Active" value={analytics.activeEnrollments} tone="won" />
            <StatCard label="Completed" value={analytics.completedEnrollments} tone="neutral" />
            <StatCard label="Paused" value={analytics.pausedEnrollments} tone="lost" />
            <StatCard label="Emails sent" value={analytics.emailsSent} tone="neutral" />
            <StatCard label="Unsubscribes" value={analytics.unsubscribes} tone="lost" />
          </div>
        </Panel>

        {/* Email performance rates */}
        <Panel>
          <PanelHead title="Email performance" sub="Open, click, reply, and bounce rates" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-4">
            <RateCard label="Open rate" value={analytics.openRate} total={analytics.emailsOpened} of={analytics.emailsSent} />
            <RateCard label="Click rate" value={analytics.clickRate} total={analytics.emailsClicked} of={analytics.emailsSent} />
            <RateCard label="Reply rate" value={analytics.replyRate} total={analytics.emailsReplied} of={analytics.emailsSent} />
            <RateCard label="Bounce rate" value={analytics.bounceRate} total={analytics.emailsBounced} of={analytics.emailsSent} />
            <RateCard label="Unsub rate" value={analytics.unsubscribeRate} total={analytics.unsubscribes} of={analytics.emailsSent} />
          </div>
        </Panel>

        {/* Per-step breakdown */}
        <Panel>
          <PanelHead title="Per-step performance" sub="How each step in the sequence is performing" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule text-xs text-ink-soft">
                  <th className="text-left px-4 py-2 font-semibold">#</th>
                  <th className="text-left px-4 py-2 font-semibold">Action</th>
                  <th className="text-left px-4 py-2 font-semibold">Subject</th>
                  <th className="text-right px-4 py-2 font-semibold">Sent</th>
                  <th className="text-right px-4 py-2 font-semibold">Opened</th>
                  <th className="text-right px-4 py-2 font-semibold">Open %</th>
                  <th className="text-right px-4 py-2 font-semibold">Clicked</th>
                  <th className="text-right px-4 py-2 font-semibold">Click %</th>
                  <th className="text-right px-4 py-2 font-semibold">Replied</th>
                  <th className="text-right px-4 py-2 font-semibold">Bounced</th>
                </tr>
              </thead>
              <tbody>
                {analytics.perStep.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-ink-soft">No steps yet</td>
                  </tr>
                ) : (
                  analytics.perStep.map((step) => (
                    <tr key={step.stepId} className="border-b border-dashed border-rule">
                      <td className="px-4 py-2.5 font-mono text-xs">{step.position + 1}</td>
                      <td className="px-4 py-2.5"><Badge tone="neutral">{step.action}</Badge></td>
                      <td className="px-4 py-2.5 text-xs max-w-[200px] truncate">{step.subject || "—"}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{step.sent}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{step.opened}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{step.openRate.toFixed(1)}%</td>
                      <td className="px-4 py-2.5 text-right font-mono">{step.clicked}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{step.clickRate.toFixed(1)}%</td>
                      <td className="px-4 py-2.5 text-right font-mono">{step.replied}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{step.bounced}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "neutral" | "won" | "lost" }) {
  const color = tone === "won" ? "text-emerald-600" : tone === "lost" ? "text-stamp" : "text-ink";
  return (
    <div className="bg-panel border border-rule rounded p-3">
      <div className="text-xs text-ink-soft mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
    </div>
  );
}

function RateCard({ label, value, total, of }: { label: string; value: number; total: number; of: number }) {
  return (
    <div className="bg-panel border border-rule rounded p-3">
      <div className="text-xs text-ink-soft mb-1">{label}</div>
      <div className="text-2xl font-bold font-mono text-ink">{value.toFixed(1)}%</div>
      <div className="text-xs text-ink-soft mt-0.5">{total} / {of}</div>
    </div>
  );
}
