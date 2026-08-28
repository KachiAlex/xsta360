"use client";

import { useState } from "react";

export type FollowUpView = "normal" | "sheet";

export function ViewToggle({
  initialView = "normal",
}: {
  initialView?: FollowUpView;
}) {
  const [view, setView] = useState<FollowUpView>(initialView);

  return (
    <div className="inline-flex bg-paper-2 rounded-md p-[3px] shrink-0">
      <button
        type="button"
        onClick={() => {
          setView("normal");
          // Show card view, hide table view
          document.querySelectorAll("[data-fu-view='normal']").forEach((el) => {
            (el as HTMLElement).style.display = "";
          });
          document.querySelectorAll("[data-fu-view='sheet']").forEach((el) => {
            (el as HTMLElement).style.display = "none";
          });
        }}
        className={`px-3 py-1.5 text-xs font-semibold rounded min-h-[32px] transition-colors ${
          view === "normal" ? "bg-panel text-ink shadow-sm" : "text-ink-soft"
        }`}
      >
        Normal
      </button>
      <button
        type="button"
        onClick={() => {
          setView("sheet");
          document.querySelectorAll("[data-fu-view='normal']").forEach((el) => {
            (el as HTMLElement).style.display = "none";
          });
          document.querySelectorAll("[data-fu-view='sheet']").forEach((el) => {
            (el as HTMLElement).style.display = "";
          });
        }}
        className={`px-3 py-1.5 text-xs font-semibold rounded min-h-[32px] transition-colors ${
          view === "sheet" ? "bg-panel text-ink shadow-sm" : "text-ink-soft"
        }`}
      >
        Sheet
      </button>
    </div>
  );
}
