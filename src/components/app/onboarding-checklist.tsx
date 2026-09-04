"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export interface OnboardingStep {
  key: string;
  label: string;
  href: string;
  done: boolean;
}

const STORAGE_KEY = "xsta360_onboarding_dismissed";

/**
 * Getting-started checklist for new workspaces. Dismissed via a button and
 * remembered in localStorage. Hidden automatically once all steps are done.
 */
export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const [dismissed, setDismissed] = useState(true); // hidden until hydrated

  useEffect(() => {
    setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  if (dismissed || allDone) return null;

  return (
    <div className="bg-panel border border-rule rounded-md p-4 sm:p-5 mb-4 sm:mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-mono text-sm uppercase tracking-wider m-0">
          Get started <span className="text-ink-soft">({doneCount}/{steps.length})</span>
        </h2>
        <button
          type="button"
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "1");
            setDismissed(true);
          }}
          className="text-xs text-ink-soft hover:text-ink"
        >
          Dismiss
        </button>
      </div>
      <ul className="space-y-2">
        {steps.map((s) => (
          <li key={s.key} className="flex items-center gap-2.5 text-sm">
            <span
              className={`w-4 h-4 rounded-full border flex items-center justify-center text-[10px] shrink-0 ${
                s.done ? "bg-register border-register text-paper" : "border-rule"
              }`}
            >
              {s.done ? "✓" : ""}
            </span>
            {s.done ? (
              <span className="text-ink-soft line-through">{s.label}</span>
            ) : (
              <Link href={s.href} className="hover:underline">
                {s.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
