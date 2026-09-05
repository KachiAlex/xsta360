import { requireAuth, getOrgBilling } from "@/lib/dal";
import { db, schema } from "@/db";
import { eq, count, and } from "drizzle-orm";
import { getOrgStages, getOrgMembers } from "@/lib/queries";
import { getPulseLeads, getDashboardStats, getUpcomingReminders } from "@/lib/dashboard";
import { getOrgCategories } from "@/lib/category-queries";
import { getTaskSummary } from "@/lib/tasks";
import { TrialCardNudge } from "@/components/app/trial-card-nudge";
import { OnboardingChecklist } from "@/components/app/onboarding-checklist";
import { Topbar, ViewTab } from "@/components/app/topbar";
import { AddLeadModal } from "@/components/app/add-lead-modal";
import { MobileFab } from "@/components/app/fab";
import { PulseCard } from "@/components/app/pulse-card";
import { TaskWidget } from "@/components/app/task-widget";
import { ReminderPanel } from "@/components/app/reminder-panel";
import { EmptyState } from "@/components/app/empty-state";
import { CardLeadBanner } from "@/components/contact-card/card-lead-banner";

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const BUCKET_META = [
  { key: "overdue" as const, label: "Overdue", color: "text-stamp" },
  { key: "today" as const, label: "Due today", color: "text-[#9c6014]" },
  { key: "upcoming" as const, label: "Upcoming", color: "text-ink" },
  { key: "quiet" as const, label: "Quiet", color: "text-ink-soft" },
];

export default async function DashboardPage(props: {
  searchParams: Promise<{ categoryId?: string }>;
}) {
  const ctx = await requireAuth();
  const filters = await props.searchParams;
  const [stages, members, categories, pulse, stats, taskSummary, upcomingReminders, billing, subRow, leadCountRow, reminderCountRow, cardRow] = await Promise.all([
    getOrgStages(ctx.orgId),
    getOrgMembers(ctx.orgId),
    getOrgCategories(ctx.orgId),
    getPulseLeads(ctx.orgId, ctx.userId, filters.categoryId),
    getDashboardStats(ctx.orgId, ctx.userId),
    getTaskSummary(ctx.orgId, ctx.userId),
    getUpcomingReminders(ctx.orgId, ctx.userId),
    getOrgBilling(ctx.orgId),
    db
      .select({ auth: schema.subscriptions.paystackAuthorizationCode })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.orgId, ctx.orgId))
      .limit(1),
    db
      .select({ value: count() })
      .from(schema.leads)
      .where(eq(schema.leads.orgId, ctx.orgId)),
    db
      .select({ value: count() })
      .from(schema.reminders)
      .where(eq(schema.reminders.orgId, ctx.orgId)),
    db
      .select({ value: count() })
      .from(schema.contactCards)
      .where(and(eq(schema.contactCards.userId, ctx.userId), eq(schema.contactCards.orgId, ctx.orgId))),
  ]);

  const totalCount =
    pulse.overdue.length + pulse.today.length + pulse.upcoming.length + pulse.quiet.length;
  const addLead = (
    <AddLeadModal stages={stages} members={members} currentUserId={ctx.userId} />
  );
  const addLeadFab = (
    <MobileFab>
      <AddLeadModal stages={stages} members={members} currentUserId={ctx.userId} />
    </MobileFab>
  );

  return (
    <>
      <Topbar actions={addLead}>
        <ViewTab active href="/dashboard">
          Overview
        </ViewTab>
        <ViewTab active={false} href="/follow-ups">
          Follow-Ups
        </ViewTab>
        <ViewTab active={false} href="/pipeline">
          Pipeline
        </ViewTab>
      </Topbar>

      <div className="content flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-7 max-w-[1240px] w-full mx-auto">
        {addLeadFab}

        {/* Category filter */}
        {categories.length > 0 && (
          <div className="mb-4">
            <form method="get" className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono uppercase tracking-wider text-ink-soft">Category:</span>
              <select
                name="categoryId"
                defaultValue={filters.categoryId ?? ""}
                className="text-sm border border-rule bg-panel rounded px-3 py-2 min-h-[44px]"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
              <button type="submit" className="text-sm font-semibold border border-ink rounded px-4 py-2 hover:bg-paper-2 min-h-[44px]">
                Filter
              </button>
              {filters.categoryId && (
                <a href="/dashboard" className="text-sm text-ink-soft underline min-h-[44px] flex items-center px-2">
                  Clear
                </a>
              )}
            </form>
          </div>
        )}
        {ctx.role === "admin" &&
          billing.plan.status === "trialing" &&
          !subRow[0]?.auth &&
          billing.daysLeftInTrial !== null &&
          billing.daysLeftInTrial >= 0 && (
            <TrialCardNudge daysLeft={billing.daysLeftInTrial} />
          )}
        <OnboardingChecklist
          steps={[
            {
              key: "lead",
              label: "Add your first lead",
              href: "/leads",
              done: (leadCountRow[0]?.value ?? 0) > 0,
            },
            {
              key: "followup",
              label: "Set a follow-up reminder",
              href: "/follow-ups",
              done: (reminderCountRow[0]?.value ?? 0) > 0,
            },
            {
              key: "card",
              label: "Create your contact card",
              href: "/contact-card",
              done: (cardRow[0]?.value ?? 0) > 0,
            },
          ]}
        />
        <CardLeadBanner userId={ctx.userId} orgId={ctx.orgId} />
        {/* Stat strip */}
        <div className="stats grid grid-cols-2 sm:grid-cols-4 gap-px bg-rule border border-rule mb-4 sm:mb-7">
          <div className="stat bg-panel px-3 sm:px-[22px] py-3 sm:py-[18px]">
            <div className="label font-mono text-[9px] sm:text-[11px] uppercase tracking-wider text-ink-soft mb-1.5 sm:mb-2">
              Leads today
            </div>
            <div className="value font-mono text-lg sm:text-[26px] font-bold">{stats.leadsToday}</div>
          </div>
          <div className="stat bg-panel px-3 sm:px-[22px] py-3 sm:py-[18px]">
            <div className="label font-mono text-[9px] sm:text-[11px] uppercase tracking-wider text-ink-soft mb-1.5 sm:mb-2">
              Overdue
            </div>
            <div className="value font-mono text-lg sm:text-[26px] font-bold text-stamp">
              {stats.overdue}
            </div>
          </div>
          <div className="stat bg-panel px-3 sm:px-[22px] py-3 sm:py-[18px]">
            <div className="label font-mono text-[9px] sm:text-[11px] uppercase tracking-wider text-ink-soft mb-1.5 sm:mb-2">
              Due today
            </div>
            <div className="value font-mono text-lg sm:text-[26px] font-bold">{stats.dueToday}</div>
          </div>
          <div className="stat bg-panel px-3 sm:px-[22px] py-3 sm:py-[18px]">
            <div className="label font-mono text-[9px] sm:text-[11px] uppercase tracking-wider text-ink-soft mb-1.5 sm:mb-2">
              Win rate (7d)
            </div>
            <div className="value font-mono text-lg sm:text-[26px] font-bold text-register">
              {stats.winRate7d}%
            </div>
          </div>
        </div>

        {/* To-Dos & Notes widget */}
        <TaskWidget summary={taskSummary} />

        {/* Two-column: pulse cards + reminders panel */}
        {totalCount === 0 ? (
          <EmptyState
            title="No leads yet"
            description="Add your first lead to start tracking follow-ups and activities."
            action={addLead}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 sm:gap-6">
            {/* Left: pulse cards */}
            <div className="space-y-5 sm:space-y-6 min-w-0">
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

            {/* Right: reminders panel (sticky) */}
            <div className="lg:sticky lg:top-[88px] lg:self-start">
              <ReminderPanel reminders={upcomingReminders} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
