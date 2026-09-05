"use client";

import { useState, useTransition } from "react";
import { bulkAssignCategory, type CategoryFormState } from "@/app/actions/categories";
import { useRouter } from "next/navigation";

export interface BulkCategoryOption {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export function BulkCategoryBar({
  leadIds,
  categories,
  selected,
  onClear,
}: {
  leadIds: string[];
  categories: BulkCategoryOption[];
  selected: Set<string>;
  onClear: () => void;
}) {
  const router = useRouter();
  const [showAssign, setShowAssign] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const count = selected.size;
  const selectedIds = Array.from(selected);

  async function doAssign(categoryId: string) {
    if (!categoryId || selectedIds.length === 0) return;

    const fd = new FormData();
    fd.set("categoryId", categoryId);
    fd.set("leadIds", selectedIds.join(","));

    startTransition(async () => {
      const res: CategoryFormState = await bulkAssignCategory({}, fd);
      if (res.ok) {
        setResult(res.message ?? "Assigned");
        onClear();
        setShowAssign(false);
        router.refresh();
        setTimeout(() => setResult(null), 3000);
      } else {
        setResult(res.message ?? "Failed");
      }
    });
  }

  if (categories.length === 0) return null;

  return (
    <div className="mb-3">
      {/* Selection toolbar */}
      {count > 0 && (
        <div className="flex items-center gap-3 bg-ink text-paper rounded px-3 py-2.5 mb-2 flex-wrap">
          <span className="text-sm font-semibold">
            {count} selected
          </span>
          <button
            type="button"
            onClick={() => setShowAssign(!showAssign)}
            className="text-xs font-semibold bg-paper text-ink rounded px-3 py-1.5 min-h-[36px] hover:bg-paper-2"
          >
            🏷 Assign category
          </button>
          <button
            type="button"
            onClick={() => {
              onClear();
              setShowAssign(false);
            }}
            className="text-xs text-paper/70 hover:text-paper underline min-h-[36px] px-2"
          >
            Clear
          </button>
          {result && (
            <span className="text-xs text-amber ml-auto">{result}</span>
          )}
        </div>
      )}

      {/* Category picker dropdown */}
      {count > 0 && showAssign && (
        <div className="bg-panel border border-rule rounded p-3 mb-2">
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => doAssign(cat.id)}
                className="text-xs px-2.5 py-1.5 min-h-[36px] rounded border border-rule bg-paper hover:bg-paper-2 flex items-center gap-1 transition-colors"
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
              </button>
            ))}
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
