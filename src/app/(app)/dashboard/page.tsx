import { requireAuth } from "@/lib/dal";
import { getOrgStages, getOrgMembers } from "@/lib/queries";
import { getPulseLeads, getDashboardStats } from "@/lib/dashboard";
import { getTaskSummary } from "@/lib/tasks";
import { Topbar, ViewTab } from "@/components/app/topbar";
import { AddLeadModal } from "@/components/app/add-lead-modal";
import { PulseCard } from "@/components/app/pulse-card";
import { TaskWidget } from "@/components/app/task-widget";
import { EmptyState } from "@/components/app/empty-state";

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const BUCKET_META = [
  { key: "overdue" as const, label: "Overdue", color: "text-stamp" },
  { key: "today" as const, label: "Due today", color: "text-[#9c6014]" },
  { key: "upcoming" as const, label: "Upcoming", color: "text-ink" },
  { key: "quiet" as const, label: "Quiet", color: "text-ink-soft" },
];

export default async function DashboardPage() {
  const ctx = await requireAuth();
  const [stages, members, pulse, stats, taskSummary] = await Promise.all([
    getOrgStages(ctx.orgId),
    getOrgMembers(ctx.orgId),
    getPulseLeads(ctx.orgId, ctx.userId),
    getDashboardStats(ctx.orgId, ctx.userId),
    getTaskSummary(ctx.orgId, ctx.userId),
  ]);

  const totalCount =
    pulse.overdue.length + pulse.today.length + pulse.upcoming.length + pulse.quiet.length;
  const addLead = (
    <AddLeadModal stages={stages} members={members} currentUserId={ctx.userId} />
  );

  return (
    <>
      <Topbar actions={addLead}>
        <ViewTab active href="/dashboard">
          Follow-Ups
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
              Overdue
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

        {/* To-Dos & Notes widget */}
        <TaskWidget summary={taskSummary} />

        {/* Pulse cards */}
        {totalCount === 0 ? (
          <EmptyState
            title="No leads yet"
            description="Add your first lead to start tracking follow-ups and activities."
            action={addLead}
          />
        ) : (
          <div className="space-y-6">
            {/* Summary line */}
            <div className="text-sm text-ink-soft font-mono">
              {formatDay(new Date())} · {totalCount} lead{totalCount === 1 ? "" : "s"} assigned to you
            </div>

            {BUCKET_META.map(({ key, label, color }) => {
              const leads = pulse[key];
              if (leads.length === 0) return null;
              return (
                <div key={key}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className={`font-mono text-[11px] uppercase tracking-wider font-bold ${color}`}>
                      {label}
                    </span>
                    <span className="font-mono text-[11px] text-ink-soft">
                      ({leads.length})
                    </span>
                    <span className="flex-1 h-px bg-rule" />
                  </div>
                  <div className="space-y-2">
                    {leads.map((lead) => (
                      <PulseCard key={lead.leadId} lead={lead} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
