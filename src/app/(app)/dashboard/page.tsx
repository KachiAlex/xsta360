import { requireAuth } from "@/lib/dal";
import { getOrgStages, getOrgMembers } from "@/lib/queries";
import { getTodayFollowUps, getDashboardStats } from "@/lib/dashboard";
import { Topbar, ViewTab } from "@/components/app/topbar";
import { AddLeadModal } from "@/components/app/add-lead-modal";
import { LogRemarkModal } from "@/components/app/log-remark-modal";
import { Panel, PanelHead } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { HeatDot } from "@/components/ui/heat-dot";
import { EmptyState } from "@/components/app/empty-state";

const SOURCE_LABELS: Record<string, string> = {
  referral: "Referral",
  social: "Social",
  ad: "Ad campaign",
  walk_in: "Walk-in",
  embedded_form: "Website form",
  other: "Other",
};

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default async function DashboardPage() {
  const ctx = await requireAuth();
  const [stages, members, followUps, stats] = await Promise.all([
    getOrgStages(ctx.orgId),
    getOrgMembers(ctx.orgId),
    getTodayFollowUps(ctx.orgId, ctx.userId),
    getDashboardStats(ctx.orgId, ctx.userId),
  ]);

  return (
    <>
      <Topbar
        actions={<AddLeadModal stages={stages} members={members} currentUserId={ctx.userId} />}
      >
        <ViewTab active href="/dashboard">
          Today&apos;s Follow-Ups
        </ViewTab>
        <ViewTab active={false} href="/pipeline">
          Pipeline
        </ViewTab>
      </Topbar>

      <div className="content flex-1 px-8 py-7 max-w-[1240px] w-full mx-auto">
        {/* Stat strip */}
        <div className="stats grid grid-cols-4 gap-px bg-rule border border-rule mb-7">
          <div className="stat bg-panel px-[22px] py-[18px]">
            <div className="label font-mono text-[11px] uppercase tracking-wider text-ink-soft mb-2">
              Leads today
            </div>
            <div className="value font-mono text-[26px] font-bold">{stats.leadsToday}</div>
          </div>
          <div className="stat bg-panel px-[22px] py-[18px]">
            <div className="label font-mono text-[11px] uppercase tracking-wider text-ink-soft mb-2">
              Overdue follow-ups
            </div>
            <div className="value font-mono text-[26px] font-bold text-stamp">
              {stats.overdue}
            </div>
          </div>
          <div className="stat bg-panel px-[22px] py-[18px]">
            <div className="label font-mono text-[11px] uppercase tracking-wider text-ink-soft mb-2">
              Due today
            </div>
            <div className="value font-mono text-[26px] font-bold">{stats.dueToday}</div>
          </div>
          <div className="stat bg-panel px-[22px] py-[18px]">
            <div className="label font-mono text-[11px] uppercase tracking-wider text-ink-soft mb-2">
              Win rate (7d)
            </div>
            <div className="value font-mono text-[26px] font-bold text-register">
              {stats.winRate7d}%
            </div>
          </div>
        </div>

        {/* Today's Follow-Ups table */}
        {followUps.length === 0 ? (
          <EmptyState
            title="No follow-ups today"
            description="You're all caught up. Add a lead or set a reminder to see it here tomorrow."
            action={<AddLeadModal stages={stages} members={members} currentUserId={ctx.userId} />}
          />
        ) : (
          <Panel>
            <PanelHead
              title="Today's Follow-Ups"
              sub={`${formatDay(new Date())} · ${followUps.length} lead${followUps.length === 1 ? "" : "s"}`}
            />
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">
                    Lead
                  </th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">
                    Last remark
                  </th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">
                    Days since contact
                  </th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft px-5 py-3 border-b border-rule font-semibold">
                    Reminder
                  </th>
                  <th className="px-5 py-3 border-b border-rule" />
                </tr>
              </thead>
              <tbody>
                {followUps.map((row) => (
                  <tr key={row.leadId} className="hover:bg-paper-2">
                    <td className="px-5 py-3.5 border-b border-dashed border-rule">
                      <div className="flex items-center gap-0">
                        <HeatDot heat={row.heat} className="mr-2.5" />
                        <div>
                          <div className="font-semibold">{row.leadName}</div>
                          <div className="text-xs text-ink-soft">
                            {row.company ? `${row.company} · ` : ""}
                            {SOURCE_LABELS[row.source] ?? row.source}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule text-sm">
                      {row.lastRemarkBody ?? <span className="text-ink-soft">No remarks yet</span>}
                    </td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule text-sm">
                      {row.daysSinceContact !== null
                        ? `${row.daysSinceContact} day${row.daysSinceContact === 1 ? "" : "s"}`
                        : "—"}
                    </td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule">
                      {row.bucket === "overdue" ? (
                        <Badge tone="overdue">Overdue</Badge>
                      ) : row.bucket === "today" && row.reminderDueAt ? (
                        <Badge tone="today">{formatTime(row.reminderDueAt)}</Badge>
                      ) : (
                        <Badge tone="later">Later</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3.5 border-b border-dashed border-rule">
                      <div className="flex gap-2">
                        <LogRemarkModal
                          leadId={row.leadId}
                          leadName={row.leadName}
                          leadCompany={row.company}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>
    </>
  );
}
