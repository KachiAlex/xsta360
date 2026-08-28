"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { HeatDot } from "@/components/ui/heat-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActivityForm } from "@/components/app/activity-form";
import { QuickReminderForm } from "@/components/app/quick-reminder-form";
import type { PulseLead, TimelineEntry } from "@/lib/dashboard";
import { completeReminderFromDashboard, snoozeReminderFromDashboard } from "@/app/actions/activities";
import { whatsappClickToChat } from "@/lib/whatsapp";

const SOURCE_LABELS: Record<string, string> = {
  referral: "Referral",
  social: "Social",
  ad: "Ad campaign",
  walk_in: "Walk-in",
  embedded_form: "Website form",
  other: "Other",
};

const ACTIVITY_ICONS: Record<string, string> = {
  call: "📞",
  email: "✉️",
  meeting: "🤝",
  visit: "📍",
  note: "📝",
  remark: "💬",
  lead_created: "✓",
  stage_changed: "→",
  lead_won: "🏆",
  lead_lost: "✕",
  lead_assigned: "↻",
};

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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

function formatTimelineDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function PulseCard({ lead }: { lead: PulseLead }) {
  const [expanded, setExpanded] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[] | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [_, startTransition] = useTransition();

  async function toggleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (!timeline) {
      setLoadingTimeline(true);
      try {
        const res = await fetch(`/api/timeline?leadId=${lead.leadId}`);
        if (res.ok) {
          const data = await res.json();
          setTimeline(data.timeline as TimelineEntry[]);
        }
      } catch {
        // ignore — timeline will just be empty
      } finally {
        setLoadingTimeline(false);
      }
    }
  }

  function handleComplete(reminderId: string) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("reminderId", reminderId);
      await completeReminderFromDashboard({}, fd);
    });
  }

  function handleSnooze(reminderId: string) {
    const when = prompt("Snooze until when? (YYYY-MM-DDTHH:MM)");
    if (!when) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("reminderId", reminderId);
      fd.set("dueAt", when);
      await snoozeReminderFromDashboard({}, fd);
    });
  }

  const reminderBadge =
    lead.bucket === "overdue" ? (
      <Badge tone="overdue">Overdue</Badge>
    ) : lead.bucket === "today" && lead.reminderDueAt ? (
      <Badge tone="today">{formatTime(lead.reminderDueAt)}</Badge>
    ) : lead.reminderDueAt ? (
      <Badge tone="later">{lead.reminderDueAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Badge>
    ) : null;

  return (
    <div className="bg-panel border border-rule rounded-[3px] overflow-hidden hover:border-ink/30 transition-colors">
      {/* Collapsed header — click to expand */}
      <button
        type="button"
        onClick={toggleExpand}
        className="w-full text-left px-3 py-2.5 sm:px-4 sm:py-3 flex items-center gap-2 sm:gap-3 cursor-pointer active:bg-paper-2/50 transition-colors"
      >
        <HeatDot heat={lead.heat} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{lead.leadName}</span>
            {lead.company && (
              <span className="text-xs text-ink-soft truncate hidden sm:inline">· {lead.company}</span>
            )}
          </div>
          <div className="text-xs text-ink-soft mt-0.5 truncate">
            {lead.lastActivityBody ? (
              <>
                <span className="mr-1">{ACTIVITY_ICONS[lead.lastActivityType ?? "note"] ?? "📝"}</span>
                {lead.lastActivityBody}
              </>
            ) : (
              "No activity yet"
            )}
            <span className="ml-1.5 hidden sm:inline">· {formatRelative(lead.lastActivityAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {lead.score > 0 && (
            <span
              className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded ${
                lead.score >= 70 ? "bg-register/12 text-register"
                  : lead.score >= 40 ? "bg-amber/14 text-[#9c6014]"
                  : "bg-paper-2 text-ink-soft"
              }`}
              title="Lead score"
            >
              {lead.score}
            </span>
          )}
          {lead.value && (
            <span className="font-mono text-[11px] text-ink-soft hidden sm:inline">
              ₦{parseFloat(lead.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          )}
          {reminderBadge}
          <span className="text-xs text-ink-soft font-mono">
            {expanded ? "▾" : "▸"}
          </span>
        </div>
      </button>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-rule px-3 py-2.5 sm:px-4 sm:py-3 bg-paper/40">
          {/* Meta row */}
          <div className="flex items-center gap-3 text-xs text-ink-soft mb-3 font-mono">
            <span>{SOURCE_LABELS[lead.source] ?? lead.source}</span>
            {lead.stageName && <span>· {lead.stageName}</span>}
            {lead.daysSinceContact !== null && (
              <span>· {lead.daysSinceContact}d since contact</span>
            )}
            {lead.score > 0 && <span>· Score: {lead.score}</span>}
          </div>

          {/* Quick contact actions */}
          {lead.phone && (
            <div className="flex gap-2 mb-3">
              <a
                href={whatsappClickToChat(lead.phone, `Hi ${lead.leadName}, following up on our conversation.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#075E54] hover:text-[#128C7E] px-3 py-2 rounded border border-[#128C7E]/20 hover:bg-[#128C7E]/5 min-h-[40px] active:bg-[#128C7E]/10"
              >
                WhatsApp
              </a>
              <a
                href={`tel:${lead.phone}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink px-3 py-2 rounded border border-rule hover:bg-paper-2 min-h-[40px] active:bg-paper-2"
              >
                Call
              </a>
            </div>
          )}

          {/* Quick actions for reminders */}
          {lead.reminderId && (
            <div className="flex gap-2 mb-3">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => handleComplete(lead.reminderId!)}
              >
                ✓ Done
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleSnooze(lead.reminderId!)}
              >
                ⏰ Snooze
              </Button>
              <Link
                href={`/leads/${lead.leadId}`}
                className="text-xs font-semibold text-ink-soft hover:text-ink ml-auto self-center min-h-[40px] flex items-center px-2 active:text-ink"
              >
                Open →
              </Link>
            </div>
          )}

          {/* Timeline */}
          <div className="mb-2">
            <div className="text-[11px] font-mono uppercase tracking-wider text-ink-soft mb-2 font-semibold">
              Activity timeline
            </div>
            {loadingTimeline ? (
              <div className="text-xs text-ink-soft py-2">Loading…</div>
            ) : timeline && timeline.length > 0 ? (
              <div className="space-y-2">
                {timeline.slice(0, 8).map((entry) => (
                  <div key={entry.id} className="flex gap-2.5 text-sm">
                    <span className="shrink-0 mt-0.5">
                      {ACTIVITY_ICONS[entry.type] ?? "•"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm">{entry.body}</div>
                      <div className="text-[11px] text-ink-soft font-mono">
                        {formatTimelineDate(new Date(entry.occurredAt))}
                        {entry.authorName && ` · ${entry.authorName}`}
                      </div>
                    </div>
                  </div>
                ))}
                {timeline.length > 8 && (
                  <Link
                    href={`/leads/${lead.leadId}`}
                    className="text-xs font-semibold text-ink-soft hover:text-ink block pt-1"
                  >
                    View all {timeline.length} entries →
                  </Link>
                )}
              </div>
            ) : (
              <div className="text-xs text-ink-soft py-2">No activities logged yet.</div>
            )}
          </div>

          {/* Inline quick reminder form */}
          <QuickReminderForm leadId={lead.leadId} />

          {/* Inline activity form */}
          <ActivityForm leadId={lead.leadId} />
        </div>
      )}
    </div>
  );
}
