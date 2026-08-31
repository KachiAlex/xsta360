"use client";

import { useState, useTransition } from "react";
import { exportLeads } from "@/app/actions/leads";

export function ExportLeadsButton({ className = "" }: { className?: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await exportLeads();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={`text-sm font-semibold border border-ink rounded px-3 py-2 hover:bg-paper-2 min-h-[44px] active:bg-paper-2 disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      >
        {pending ? "Exporting…" : "Export CSV"}
      </button>
      {error && <p className="text-xs text-stamp">{error}</p>}
    </div>
  );
}
