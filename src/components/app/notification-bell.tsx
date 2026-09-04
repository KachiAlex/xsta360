"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

const TYPE_ICONS: Record<string, string> = {
  lead_assigned: "▣",
  payment_success: "✓",
  payment_failed: "✕",
  trial_ending: "⚠",
  card_lead: "★",
  card_saved: "★",
  sequence_step: "↻",
  team_invite: "✉",
};

const TYPE_COLORS: Record<string, string> = {
  lead_assigned: "text-register",
  payment_success: "text-register",
  payment_failed: "text-stamp",
  trial_ending: "text-amber",
  card_lead: "text-amber",
  card_saved: "text-amber",
  sequence_step: "text-ink-soft",
  team_invite: "text-ink-soft",
};

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch {
      // silent fail
    }
  }, []);

  // Initial load + poll every 30s.
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleMarkAllRead() {
    setLoading(true);
    try {
      await fetch("/api/notifications/read-all", { method: "POST" });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open && unreadCount > 0) {
            // Don't auto-mark-read on open — let user see them first.
          }
        }}
        className="relative text-sm font-mono border border-rule bg-paper px-2.5 py-2 rounded min-w-[40px] min-h-[40px] flex items-center justify-center active:bg-paper-2 transition-colors hover:bg-paper-2"
        aria-label="Notifications"
      >
        <span className="text-base">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-stamp text-paper text-[9px] font-mono font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-[320px] max-w-[90vw] bg-panel border border-rule rounded-md shadow-[0_20px_50px_-15px_rgba(30,42,34,0.3)] z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-rule">
            <span className="font-mono text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={loading}
                className="text-xs text-ink-soft hover:text-ink underline underline-offset-2"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-ink-soft">
                No notifications yet.
              </div>
            ) : (
              notifications.map((n) => {
                const icon = TYPE_ICONS[n.type] ?? "•";
                const color = TYPE_COLORS[n.type] ?? "text-ink-soft";
                const content = (
                  <div className={`px-4 py-3 border-b border-rule/50 hover:bg-paper-2/50 transition-colors flex gap-3 ${n.readAt ? "opacity-60" : ""}`}>
                    <span className={`text-base shrink-0 ${color}`}>{icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{n.title}</div>
                      {n.body && <div className="text-xs text-ink-soft mt-0.5 line-clamp-2">{n.body}</div>}
                      <div className="text-[10px] text-ink-soft/70 mt-1 font-mono">{timeAgo(n.createdAt)}</div>
                    </div>
                    {!n.readAt && (
                      <span className="w-2 h-2 rounded-full bg-stamp shrink-0 mt-1.5" />
                    )}
                  </div>
                );
                return n.link ? (
                  <Link key={n.id} href={n.link} onClick={() => setOpen(false)}>
                    {content}
                  </Link>
                ) : (
                  <div key={n.id}>{content}</div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
