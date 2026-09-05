"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkAssignCategory, type CategoryFormState } from "@/app/actions/categories";
import { bulkDeleteLeads, bulkAssignLeads, bulkMoveStage, type BulkFormState } from "@/app/actions/leads";
import { bulkEnrollLeads } from "@/app/actions/sequences";

export interface BulkCategoryOption {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface BulkMemberOption {
  userId: string;
  name: string;
}

export interface BulkStageOption {
  id: string;
  name: string;
}

export interface BulkSequenceOption {
  id: string;
  name: string;
  active: boolean;
}

type Panel = "category" | "assign" | "stage" | "delete" | "sequence" | null;

export function BulkActionBar({
  leadIds,
  categories,
  members,
  stages,
  sequences,
  selected,
  onClear,
  canDelete,
}: {
  leadIds: string[];
  categories: BulkCategoryOption[];
  members: BulkMemberOption[];
  stages: BulkStageOption[];
  sequences: BulkSequenceOption[];
  selected: Set<string>;
  onClear: () => void;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [activePanel, setActivePanel] = useState<Panel>(null);
  const [result, setResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const count = selected.size;
  const selectedIds = Array.from(selected);

  function run(fn: () => Promise<{ ok?: boolean; message?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setResult(res.message ?? "Done");
        onClear();
        setActivePanel(null);
        router.refresh();
        setTimeout(() => setResult(null), 3000);
      } else {
        setResult(res.message ?? "Failed");
      }
    });
  }

  function doAssignCategory(categoryId: string) {
    const fd = new FormData();
    fd.set("categoryId", categoryId);
    fd.set("leadIds", selectedIds.join(","));
    run(() => bulkAssignCategory({}, fd));
  }

  function doDelete() {
    const fd = new FormData();
    fd.set("leadIds", selectedIds.join(","));
    run(() => bulkDeleteLeads({}, fd));
  }

  function doAssignRep(assigneeId: string) {
    const fd = new FormData();
    fd.set("leadIds", selectedIds.join(","));
    fd.set("assigneeId", assigneeId);
    run(() => bulkAssignLeads({}, fd));
  }

  function doMoveStage(stageId: string) {
    const fd = new FormData();
    fd.set("leadIds", selectedIds.join(","));
    fd.set("stageId", stageId);
    run(() => bulkMoveStage({}, fd));
  }

  function doEnrollSequence(sequenceId: string) {
    const fd = new FormData();
    fd.set("leadIds", selectedIds.join(","));
    fd.set("sequenceId", sequenceId);
    run(() => bulkEnrollLeads({}, fd));
  }

  if (count === 0) return null;

  return (
    <div className="mb-3">
      {/* Selection toolbar */}
      <div className="flex items-center gap-2 bg-ink text-paper rounded px-3 py-2.5 mb-2 flex-wrap">
        <span className="text-sm font-semibold whitespace-nowrap">
          {count} selected
        </span>

        {/* Add to category — always visible */}
        <button
          type="button"
          onClick={() => setActivePanel(activePanel === "category" ? null : "category")}
          className="text-xs font-semibold bg-paper text-ink rounded px-3 py-1.5 min-h-[36px] hover:bg-paper-2"
        >
          🏷 Category
        </button>

        {/* Assign rep */}
        {members.length > 0 && (
          <button
            type="button"
            onClick={() => setActivePanel(activePanel === "assign" ? null : "assign")}
            className="text-xs font-semibold bg-paper text-ink rounded px-3 py-1.5 min-h-[36px] hover:bg-paper-2"
          >
            👤 Assign
          </button>
        )}

        {/* Move stage */}
        {stages.length > 0 && (
          <button
            type="button"
            onClick={() => setActivePanel(activePanel === "stage" ? null : "stage")}
            className="text-xs font-semibold bg-paper text-ink rounded px-3 py-1.5 min-h-[36px] hover:bg-paper-2"
          >
            📋 Stage
          </button>
        )}

        {/* Enroll in sequence */}
        {sequences.length > 0 && (
          <button
            type="button"
            onClick={() => setActivePanel(activePanel === "sequence" ? null : "sequence")}
            className="text-xs font-semibold bg-paper text-ink rounded px-3 py-1.5 min-h-[36px] hover:bg-paper-2"
          >
            ⚡ Sequence
          </button>
        )}

        {/* Delete */}
        {canDelete && (
          <button
            type="button"
            onClick={() => setActivePanel(activePanel === "delete" ? null : "delete")}
            className="text-xs font-semibold bg-stamp text-paper rounded px-3 py-1.5 min-h-[36px] hover:bg-stamp/90"
          >
            🗑 Delete
          </button>
        )}

        <button
          type="button"
          onClick={() => { onClear(); setActivePanel(null); }}
          className="text-xs text-paper/70 hover:text-paper underline min-h-[36px] px-2 ml-auto"
        >
          Clear
        </button>

        {pending && <span className="text-xs text-amber">Working…</span>}
        {result && <span className="text-xs text-amber">{result}</span>}
      </div>

      {/* Category panel */}
      {activePanel === "category" && (
        <div className="bg-panel border border-rule rounded p-3 mb-2">
          {categories.length === 0 ? (
            <div>
              <p className="text-sm text-ink-soft mb-2">No categories yet. Create one first to organize your leads.</p>
              <a
                href="/categories"
                className="text-xs font-semibold border border-ink rounded px-3 py-1.5 min-h-[36px] inline-flex items-center hover:bg-paper-2"
              >
                Go to Categories →
              </a>
            </div>
          ) : (
            <>
              <p className="text-xs font-semibold text-ink-soft mb-2">Assign to category:</p>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    disabled={pending}
                    onClick={() => doAssignCategory(cat.id)}
                    className="text-xs px-2.5 py-1.5 min-h-[36px] rounded border border-rule bg-paper hover:bg-paper-2 flex items-center gap-1 transition-colors disabled:opacity-50"
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Assign rep panel */}
      {activePanel === "assign" && (
        <div className="bg-panel border border-rule rounded p-3 mb-2">
          <p className="text-xs font-semibold text-ink-soft mb-2">Assign to rep:</p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              disabled={pending}
              onClick={() => doAssignRep("")}
              className="text-xs px-2.5 py-1.5 min-h-[36px] rounded border border-rule bg-paper hover:bg-paper-2 transition-colors disabled:opacity-50"
            >
              Unassigned
            </button>
            {members.map((m) => (
              <button
                key={m.userId}
                type="button"
                disabled={pending}
                onClick={() => doAssignRep(m.userId)}
                className="text-xs px-2.5 py-1.5 min-h-[36px] rounded border border-rule bg-paper hover:bg-paper-2 transition-colors disabled:opacity-50"
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Move stage panel */}
      {activePanel === "stage" && (
        <div className="bg-panel border border-rule rounded p-3 mb-2">
          <p className="text-xs font-semibold text-ink-soft mb-2">Move to stage:</p>
          <div className="flex flex-wrap gap-1.5">
            {stages.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={pending}
                onClick={() => doMoveStage(s.id)}
                className="text-xs px-2.5 py-1.5 min-h-[36px] rounded border border-rule bg-paper hover:bg-paper-2 transition-colors disabled:opacity-50"
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sequence enrollment panel */}
      {activePanel === "sequence" && (
        <div className="bg-panel border border-rule rounded p-3 mb-2">
          <p className="text-xs font-semibold text-ink-soft mb-2">Enroll {count} lead{count === 1 ? "" : "s"} in sequence:</p>
          <div className="flex flex-wrap gap-1.5">
            {sequences.filter((s) => s.active).map((seq) => (
              <button
                key={seq.id}
                type="button"
                disabled={pending}
                onClick={() => doEnrollSequence(seq.id)}
                className="text-xs px-2.5 py-1.5 min-h-[36px] rounded border border-rule bg-paper hover:bg-paper-2 transition-colors disabled:opacity-50"
              >
                ⚡ {seq.name}
              </button>
            ))}
            {sequences.filter((s) => s.active).length === 0 && (
              <p className="text-xs text-ink-soft">No active sequences. Activate a sequence first.</p>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation panel */}
      {activePanel === "delete" && (
        <div className="bg-stamp/10 border border-stamp/30 rounded p-3 mb-2">
          <p className="text-sm font-semibold text-stamp mb-2">
            Delete {count} lead{count === 1 ? "" : "s"}? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={doDelete}
              className="text-xs font-semibold bg-stamp text-paper rounded px-3 py-1.5 min-h-[36px] hover:bg-stamp/90 disabled:opacity-50"
            >
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setActivePanel(null)}
              className="text-xs font-semibold border border-rule rounded px-3 py-1.5 min-h-[36px] hover:bg-paper-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper to render a checkbox for each lead row.
export function LeadCheckbox({
  leadId,
  selected,
  onToggle,
}: {
  leadId: string;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={selected}
      onChange={() => onToggle(leadId)}
      onClick={(e) => e.stopPropagation()}
      className="w-4 h-4 accent-ink cursor-pointer flex-shrink-0"
      aria-label={`Select lead ${leadId}`}
    />
  );
}
