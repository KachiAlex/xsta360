"use client";

import { useState, useEffect } from "react";

export type FollowUpView = "normal" | "sheet";

export function ViewToggle({
  initialView = "normal",
}: {
  initialView?: FollowUpView;
}) {
  const [view, setView] = useState<FollowUpView>(initialView);

  // Apply visibility based on current view state.
  useEffect(() => {
    const normalEls = document.querySelectorAll("[data-fu-view='normal']");
    const sheetEls = document.querySelectorAll("[data-fu-view='sheet']");
    const showNormal = view === "normal";
    normalEls.forEach((el) => {
      (el as HTMLElement).style.display = showNormal ? "" : "none";
    });
    sheetEls.forEach((el) => {
      (el as HTMLElement).style.display = showNormal ? "none" : "";
    });
  }, [view]);

  return (
    <div className="inline-flex bg-paper-2 rounded-md p-[3px] shrink-0">
      <button
        type="button"
        onClick={() => setView("normal")}
        aria-pressed={view === "normal"}
        className={`px-3 py-1.5 text-xs font-semibold rounded min-h-[32px] transition-colors ${
          view === "normal" ? "bg-panel text-ink shadow-sm" : "text-ink-soft"
        }`}
      >
        Normal
      </button>
      <button
        type="button"
        onClick={() => setView("sheet")}
        aria-pressed={view === "sheet"}
        className={`px-3 py-1.5 text-xs font-semibold rounded min-h-[32px] transition-colors ${
          view === "sheet" ? "bg-panel text-ink shadow-sm" : "text-ink-soft"
        }`}
      >
        Sheet
      </button>
    </div>
  );
}
