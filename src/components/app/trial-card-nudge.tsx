"use client";

import Link from "next/link";

/**
 * Small nudge card for trialing admins who haven't saved a card yet.
 * Encourages adding payment early so there's no interruption at trial end.
 */
export function TrialCardNudge({ daysLeft }: { daysLeft: number }) {
  return (
    <div className="bg-panel border border-amber/25 rounded-md px-4 py-3 mb-4 sm:mb-6 flex items-center gap-3">
      <span className="w-2 h-2 rounded-full bg-amber shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">
          {daysLeft} day{daysLeft !== 1 ? "s" : ""} left on your free trial
        </div>
        <div className="text-xs text-ink-soft">
          Save your card now and we&rsquo;ll only charge you when the trial ends — no interruption.
        </div>
      </div>
      <Link
        href="/billing"
        className="shrink-0 text-xs font-semibold bg-ink text-paper px-3 py-2 rounded hover:opacity-90"
      >
        Add card
      </Link>
    </div>
  );
}
