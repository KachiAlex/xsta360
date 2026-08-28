"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { completeReminderFromDashboard, snoozeReminderFromDashboard, deleteReminder } from "@/app/actions/activities";
import type { ReminderRow } from "@/lib/dashboard";
import { whatsappClickToChat } from "@/lib/whatsapp";

function formatDue(d: Date): string {
  const now = new Date();
  const sod = new Date(now);
  sod.setHours(0, 0, 0, 0);
  const eod = new Date(now);
  eod.setHours(23, 59, 59, 999);
  const diff = d.getTime() - sod.getTime();
  const days = Math.floor(diff / 86_400_000);

  if (d < sod) {
    const overdueDays = Math.abs(days);
    if (overdueDays === 0) return "Overdue";
    return `${overdueDays}d overdue`;
  }
  if (d <= eod) {
    return `Today, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  if (days === 1) return "Tomorrow";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ` · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

export function ReminderPanel({
  reminders,
}: {
  reminders: { overdue: ReminderRow[]; today: ReminderRow[]; upcoming: ReminderRow[] };
}) {
  const total = reminders.overdue.length + reminders.today.length + reminders.upcoming.length;

  if (total === 0) {
    return (
      <div className="bg-panel border border-rule rounded p-5 text-center">
        <div className="text-sm text-ink-soft">
          No upcoming reminders. Set a reminder from any lead card to get notified.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-panel border border-rule rounded overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-rule">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold">🔔 Reminders</span>
          <span className="text-xs text-ink-soft font-mono">({total})</span>
        </div>
      </div>

      {/* Overdue */}
      {reminders.overdue.length > 0 && (
        <ReminderGroup
          label="Overdue"
          tone="overdue"
          color="text-stamp"
          rows={reminders.overdue}
        />
      )}

      {/* Today */}
      {reminders.today.length > 0 && (
        <ReminderGroup
          label="Today"
          tone="today"
          color="text-[#9c6014]"
          rows={reminders.today}
        />
      )}

      {/* Upcoming */}
      {reminders.upcoming.length > 0 && (
        <ReminderGroup
          label="Upcoming"
          tone="later"
          color="text-ink-soft"
          rows={reminders.upcoming}
        />
      )}
    </div>
  );
}

function ReminderGroup({
  label,
  tone,
  color,
  rows,
}: {
  label: string;
  tone: "overdue" | "today" | "later";
  color: string;
  rows: ReminderRow[];
}) {
  return (
    <div className="border-b border-rule last:border-b-0">
      <div className="flex items-center gap-2 px-4 py-2 bg-paper-2/50">
        <span className={`font-mono text-[11px] uppercase tracking-wider font-bold ${color}`}>
          {label}
        </span>
        <span className="font-mono text-[11px] text-ink-soft">({rows.length})</span>
      </div>
      <div className="divide-y divide-dashed divide-rule">
        {rows.map((r) => (
          <ReminderItem key={r.id} reminder={r} />
        ))}
      </div>
    </div>
  );
}

function ReminderItem({ reminder }: { reminder: ReminderRow }) {
  const [, startTransition] = useTransition();

  function handleComplete() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("reminderId", reminder.id);
      await completeReminderFromDashboard({}, fd);
    });
  }

  function handleSnooze() {
    const when = prompt("Snooze until when? (YYYY-MM-DDTHH:MM)");
    if (!when) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("reminderId", reminder.id);
      fd.set("dueAt", when);
      await snoozeReminderFromDashboard({}, fd);
    });
  }

  function handleDelete() {
    if (!confirm("Delete this reminder?")) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("reminderId", reminder.id);
      await deleteReminder({}, fd);
    });
  }

  return (
    <div className="px-3 sm:px-4 py-2.5 flex items-center gap-2 sm:gap-3 hover:bg-paper-2/30 flex-wrap sm:flex-nowrap">
      {/* Due badge */}
      <Badge tone={reminder.bucket === "overdue" ? "overdue" : reminder.bucket === "today" ? "today" : "later"}>
        {formatDue(reminder.dueAt)}
      </Badge>

      {/* Lead info */}
      <div className="flex-1 min-w-0 order-3 sm:order-none w-full sm:w-auto">
        <Link
          href={`/leads/${reminder.leadId}`}
          className="text-sm font-semibold hover:underline truncate"
        >
          {reminder.leadName}
        </Link>
        {reminder.leadCompany && (
          <span className="text-xs text-ink-soft ml-1.5 truncate">· {reminder.leadCompany}</span>
        )}
        {reminder.note && (
          <div className="text-xs text-ink-soft truncate mt-0.5">{reminder.note}</div>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto sm:ml-0">
        {reminder.leadPhone && (
          <a
            href={whatsappClickToChat(reminder.leadPhone, `Hi ${reminder.leadName}, following up.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#075E54] hover:text-[#128C7E] px-1.5 py-1"
            title="WhatsApp"
          >
            WhatsApp
          </a>
        )}
        <button
          type="button"
          onClick={handleComplete}
          className="text-xs font-semibold text-register hover:underline px-1.5 py-1"
          title="Mark done"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={handleSnooze}
          className="text-xs text-ink-soft hover:text-ink px-1.5 py-1"
          title="Snooze"
        >
          ⏰
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="text-xs text-ink-soft hover:text-stamp px-1.5 py-1"
          title="Delete"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
