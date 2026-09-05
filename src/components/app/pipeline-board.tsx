"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
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
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function onDrop(targetStageId: string) {
    if (!draggedId) return;
    setDragOverCol(null);
    moveLead(draggedId, targetStageId);
    setDraggedId(null);
  }

  function moveLead(leadId: string, targetStageId: string) {
    // Optimistic move.
    setColumns((prev) => {
      let moved: PipelineColumn["leads"][number] | null = null;
      const next = prev.map((col) => {
        const idx = col.leads.findIndex((l) => l.id === leadId);
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

    // Persist via server action — revert on failure.
    const fd = new FormData();
    fd.set("leadId", leadId);
    fd.set("toStageId", targetStageId);
    startTransition(async () => {
      try {
        const result = await changeStage({}, fd);
        if (result && (result.message || result.errors)) {
          setColumns(initialColumns);
        }
      } catch {
        setColumns(initialColumns);
      }
    });
  }

  // Find which stage a lead is currently in.
  function getLeadStageId(leadId: string): string | null {
    for (const col of columns) {
      if (col.leads.some((l) => l.id === leadId)) return col.id;
    }
    return null;
  }

  return (
    <div className="board flex md:grid md:grid-cols-[repeat(4,1fr)] gap-2.5 sm:gap-3 md:gap-3.5 overflow-x-auto scroll-touch pb-2 md:pb-0 snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0">
      {columns.map((col) => (
        <div
          key={col.id}
          className={`col bg-paper-2 border border-rule rounded-md min-h-[400px] sm:min-h-[420px] flex flex-col w-[78vw] sm:w-[280px] md:w-auto shrink-0 snap-start ${
            dragOverCol === col.id ? "bg-[#E4E9DF]" : ""
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOverCol(col.id);
          }}
          onDragLeave={() => setDragOverCol(null)}
          onDrop={() => onDrop(col.id)}
        >
          <div className="col-head px-3 sm:px-4 py-3 border-b border-rule flex justify-between items-center">
            <h3 className="font-mono text-[12px] sm:text-[13px] m-0 uppercase tracking-wider truncate">{col.name}</h3>
            <span className="col-count font-mono text-[11px] text-ink-soft shrink-0 ml-2">{col.leads.length}</span>
          </div>
          <div className="col-body p-2.5 sm:p-3 flex flex-col gap-2 sm:gap-2.5 flex-1">
            {col.leads.map((lead) => {
              const isMoving = movingLeadId === lead.id;
              const currentStageId = getLeadStageId(lead.id);
              return (
                <div key={lead.id} className="relative">
                  <Link
                    href={`/leads/${lead.id}`}
                    draggable
                    onDragStart={() => setDraggedId(lead.id)}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDragOverCol(null);
                    }}
                    className={`card bg-panel border border-rule rounded p-2.5 sm:p-3 cursor-grab shadow-[0_1px_0_var(--color-rule)] active:cursor-grabbing hover:border-ink hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all active:bg-paper-2/50 block ${
                      draggedId === lead.id ? "opacity-40" : ""
                    } ${isMoving ? "border-ink ring-2 ring-amber" : ""}`}
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
                  </Link>

                  {/* Touch move button — visible on mobile only */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMovingLeadId(isMoving ? null : lead.id);
                    }}
                    className="md:hidden absolute top-1.5 right-1.5 w-8 h-8 flex items-center justify-center rounded bg-paper-2 border border-rule text-xs text-ink-soft active:bg-paper-2/70"
                    aria-label="Move lead to another stage"
                  >
                    {isMoving ? "✕" : "⇄"}
                  </button>

                  {/* Stage picker — shown when moving on mobile */}
                  {isMoving && (
                    <div className="md:hidden mt-1.5 bg-panel border border-ink rounded p-2 space-y-1 shadow-lg">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-ink-soft px-1">Move to:</div>
                      {columns.map((targetCol) => (
                        <button
                          key={targetCol.id}
                          type="button"
                          disabled={targetCol.id === currentStageId}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            moveLead(lead.id, targetCol.id);
                            setMovingLeadId(null);
                          }}
                          className={`w-full text-left text-xs px-2.5 py-2 min-h-[40px] rounded flex items-center gap-2 transition-colors ${
                            targetCol.id === currentStageId
                              ? "bg-paper-2 text-ink-soft opacity-50"
                              : "bg-paper hover:bg-paper-2 text-ink active:bg-paper-2"
                          }`}
                        >
                          <span className="font-mono uppercase tracking-wider text-[10px] text-ink-soft">{targetCol.name}</span>
                          {targetCol.id === currentStageId && <span className="ml-auto text-[10px]">current</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {col.leads.length === 0 && (
              <div className="text-center text-xs text-ink-soft py-6">Drop leads here</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
