"use client";

import { useState, useTransition } from "react";
import { exportReport } from "@/app/actions/reports";

export function ExportReportButton({ range }: { range: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await exportReport(range);
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
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="font-mono text-[11px] px-3 py-1.5 rounded border border-ink bg-paper text-ink hover:bg-paper-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Exporting…" : "Export CSV"}
      </button>
      {error && <span className="text-xs text-stamp">{error}</span>}
    </span>
  );
}
