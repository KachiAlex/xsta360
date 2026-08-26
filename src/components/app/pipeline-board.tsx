"use client";

import { useState, useTransition } from "react";
import { changeStage } from "@/app/actions/leads";
import type { PipelineColumn } from "@/lib/pipeline";

const SOURCE_SHORT: Record<string, string> = {
  referral: "Referral",
  social: "Social",
  ad: "Ad campaign",
  walk_in: "Walk-in",
  embedded_form: "Web form",
  other: "Other",
};

export function PipelineBoard({ initialColumns }: { initialColumns: PipelineColumn[] }) {
  const [columns, setColumns] = useState(initialColumns);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onDrop(targetStageId: string) {
    if (!draggedId) return;
    setDragOverCol(null);

    // Optimistic move.
    setColumns((prev) => {
      let moved: PipelineColumn["leads"][number] | null = null;
      const next = prev.map((col) => {
        const idx = col.leads.findIndex((l) => l.id === draggedId);
        if (idx >= 0) {
          moved = col.leads[idx];
          return { ...col, leads: col.leads.filter((_, i) => i !== idx) };
        }
        return col;
      });
      if (!moved) return prev;
      return next.map((col) =>
        col.id === targetStageId ? { ...col, leads: [moved!, ...col.leads] } : col,
      );
    });

    // Persist via server action.
    const fd = new FormData();
    fd.set("leadId", draggedId);
    fd.set("toStageId", targetStageId);
    startTransition(async () => {
      await changeStage({}, fd);
    });

    setDraggedId(null);
  }

  return (
    <div className="board grid grid-cols-[repeat(4,1fr)] gap-3.5">
      {columns.map((col) => (
        <div
          key={col.id}
          className={`col bg-paper-2 border border-rule rounded-md min-h-[420px] flex flex-col ${
            dragOverCol === col.id ? "bg-[#E4E9DF]" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverCol(col.id);
          }}
          onDragLeave={() => setDragOverCol(null)}
          onDrop={() => onDrop(col.id)}
        >
          <div className="col-head px-4 py-3.5 border-b border-rule flex justify-between items-center">
            <h3 className="font-mono text-[13px] m-0 uppercase tracking-wider">{col.name}</h3>
            <span className="col-count font-mono text-[11px] text-ink-soft">{col.leads.length}</span>
          </div>
          <div className="col-body p-3 flex flex-col gap-2.5 flex-1">
            {col.leads.map((lead) => (
              <div
                key={lead.id}
                draggable
                onDragStart={() => setDraggedId(lead.id)}
                onDragEnd={() => {
                  setDraggedId(null);
                  setDragOverCol(null);
                }}
                className={`card bg-panel border border-rule rounded p-3 cursor-grab shadow-[0_1px_0_var(--color-rule)] active:cursor-grabbing ${
                  draggedId === lead.id ? "opacity-40" : ""
                }`}
              >
                <div className="name font-semibold text-sm mb-[3px]">{lead.name}</div>
                {lead.company && (
                  <div className="company text-xs text-ink-soft mb-2.5">{lead.company}</div>
                )}
                <div className="meta flex justify-between items-center">
                  <span className="source font-mono text-[10.5px] text-ink-soft bg-paper-2 px-1.5 py-0.5 rounded">
                    {SOURCE_SHORT[lead.source] ?? lead.source}
                  </span>
                </div>
              </div>
            ))}
            {col.leads.length === 0 && (
              <div className="text-center text-xs text-ink-soft py-6">Drop leads here</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
