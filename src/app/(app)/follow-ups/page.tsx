import { requireAuth } from "@/lib/dal";
import { getOrgStages, getOrgMembers } from "@/lib/queries";
import { getPulseLeads, getUpcomingReminders } from "@/lib/dashboard";
import { Topbar, ViewTab } from "@/components/app/topbar";
import { AddLeadModal } from "@/components/app/add-lead-modal";
import { MobileFab } from "@/components/app/fab";
import { PulseCard } from "@/components/app/pulse-card";
import { ReminderPanel } from "@/components/app/reminder-panel";
import { EmptyState } from "@/components/app/empty-state";
import { ViewToggle } from "@/components/app/view-toggle";
import { Badge } from "@/components/ui/badge";
import { HeatDot } from "@/components/ui/heat-dot";
import Link from "next/link";
import { whatsappClickToChat } from "@/lib/whatsapp";

function formatDay(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatRelative(d: Date | null): string {
  if (!d) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

const BUCKET_META = [
  { key: "overdue" as const, label: "Overdue", color: "text-stamp" },
  { key: "today" as const, label: "Due today", color: "text-[#9c6014]" },
  { key: "upcoming" as const, label: "Upcoming", color: "text-ink" },
  { key: "quiet" as const, label: "Quiet", color: "text-ink-soft" },
];

const ACTIVITY_ICONS: Record<string, string> = {
  call: "📞",
  email: "✉️",
  meeting: "🤝",
  visit: "📍",
  note: "📝",
  remark: "💬",
};

export default async function FollowUpsPage() {
  const ctx = await requireAuth();
  const [stages, members, pulse, upcomingReminders] = await Promise.all([
    getOrgStages(ctx.orgId),
    getOrgMembers(ctx.orgId),
    getPulseLeads(ctx.orgId, ctx.userId),
    getUpcomingReminders(ctx.orgId, ctx.userId),
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

  // Flatten all leads for the sheet view
  const allLeads = [...pulse.overdue, ...pulse.today, ...pulse.upcoming, ...pulse.quiet];

  return (
    <>
      <Topbar actions={addLead}>
        <ViewTab active={false} href="/dashboard">
          Overview
        </ViewTab>
        <ViewTab active href="/follow-ups">
          Follow-Ups
        </ViewTab>
      </Topbar>

      <div className="content flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-7 max-w-[1240px] w-full mx-auto">
        {addLeadFab}

        {/* Header row with view toggle */}
        <div className="flex items-center justify-between mb-4 sm:mb-5 flex-wrap gap-2">
          <div className="text-sm text-ink-soft font-mono">
            {formatDay(new Date())} · {totalCount} lead{totalCount === 1 ? "" : "s"} to follow up
          </div>
          <ViewToggle initialView="normal" />
        </div>

        {totalCount === 0 ? (
          <EmptyState
            title="No leads to follow up"
            description="Add your first lead to start tracking follow-ups and activities."
            action={addLead}
          />
        ) : (
          <>
            {/* Normal (card) view */}
            <div data-fu-view="normal">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 sm:gap-6">
                {/* Left: pulse cards by bucket */}
                <div className="space-y-5 sm:space-y-6 min-w-0">
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
            </div>

            {/* Sheet (table) view */}
            <div data-fu-view="sheet" style={{ display: "none" }}>
              <div className="bg-panel border border-rule rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-paper-2 border-b border-rule">
                    <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                      <th className="px-3 sm:px-4 py-3 font-semibold">Lead</th>
                      <th className="px-3 sm:px-4 py-3 font-semibold hidden sm:table-cell">Stage</th>
                      <th className="px-3 sm:px-4 py-3 font-semibold">Last activity</th>
                      <th className="px-3 sm:px-4 py-3 font-semibold">Bucket</th>
                      <th className="px-3 sm:px-4 py-3 font-semibold hidden sm:table-cell">Reminder</th>
                      <th className="px-3 sm:px-4 py-3 font-semibold hidden sm:table-cell">Score</th>
                      <th className="px-3 sm:px-4 py-3 font-semibold">Contact</th>
                      <th className="px-3 sm:px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dashed divide-rule">
                    {allLeads.map((lead) => (
                      <tr key={lead.leadId} className="hover:bg-paper-2/30">
                        <td className="px-3 sm:px-4 py-3">
                          <div className="flex items-center gap-2">
                            <HeatDot heat={lead.heat} />
                            <div className="min-w-0">
                              <Link href={`/leads/${lead.leadId}`} className="font-semibold hover:underline truncate block">
                                {lead.leadName}
                              </Link>
                              {lead.company && (
                                <div className="text-xs text-ink-soft truncate">{lead.company}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
                          {lead.stageName && <Badge tone="neutral">{lead.stageName}</Badge>}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-xs text-ink-soft">
                          {lead.lastActivityBody ? (
                            <>
                              <span className="mr-1">{ACTIVITY_ICONS[lead.lastActivityType ?? "note"] ?? "📝"}</span>
                              <span className="truncate">{lead.lastActivityBody}</span>
                              <div className="text-[10px] mt-0.5">{formatRelative(lead.lastActivityAt)}</div>
                            </>
                          ) : (
                            <span>No activity yet</span>
                          )}
                        </td>
                        <td className="px-3 sm:px-4 py-3">
                          <span className={`text-xs font-semibold ${
                            lead.bucket === "overdue" ? "text-stamp"
                            : lead.bucket === "today" ? "text-[#9c6014]"
                            : lead.bucket === "upcoming" ? "text-ink"
                            : "text-ink-soft"
                          }`}>
                            {lead.bucket === "overdue" ? "Overdue"
                            : lead.bucket === "today" ? "Today"
                            : lead.bucket === "upcoming" ? "Upcoming"
                            : "Quiet"}
                          </span>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-xs text-ink-soft hidden sm:table-cell">
                          {lead.reminderDueAt ? (
                            lead.reminderDueAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
                            " " + lead.reminderDueAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                          ) : "—"}
                        </td>
                        <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">
                          {lead.score > 0 ? (
                            <span className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${
                              lead.score >= 70 ? "bg-register/12 text-register"
                              : lead.score >= 40 ? "bg-amber/14 text-[#9c6014]"
                              : "bg-paper-2 text-ink-soft"
                            }`}>
                              {lead.score}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 sm:px-4 py-3">
                          {lead.phone ? (
                            <div className="flex gap-1.5">
                              <a
                                href={whatsappClickToChat(lead.phone, `Hi ${lead.leadName}, following up on our conversation.`)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-semibold text-[#075E54] hover:text-[#128C7E] px-2 py-1 rounded border border-[#128C7E]/20 hover:bg-[#128C7E]/5 min-h-[32px] flex items-center active:bg-[#128C7E]/10"
                                title="WhatsApp"
                              >
                                WhatsApp
                              </a>
                              <a
                                href={`tel:${lead.phone}`}
                                className="text-xs font-semibold text-ink-soft hover:text-ink px-2 py-1 rounded border border-rule hover:bg-paper-2 min-h-[32px] flex items-center active:bg-paper-2"
                                title="Call"
                              >
                                Call
                              </a>
                            </div>
                          ) : (
                            <span className="text-xs text-ink-soft">—</span>
                          )}
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-right">
                          <Link
                            href={`/leads/${lead.leadId}`}
                            className="text-xs font-semibold text-ink-soft hover:text-ink whitespace-nowrap"
                          >
                            Open →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card fallback for sheet view */}
              <div className="sm:hidden mt-3">
                <div className="text-xs text-ink-soft text-center">
                  Swipe horizontally to see all columns →
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
