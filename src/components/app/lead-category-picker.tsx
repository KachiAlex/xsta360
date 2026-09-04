"use client";

import { useActionState, useState } from "react";
import {
  assignLeadToCategory,
  removeLeadFromCategory,
  type CategoryFormState,
} from "@/app/actions/categories";

export interface CategoryOption {
  id: string;
  name: string;
  color: string;
  icon: string;
  active: boolean;
}

export interface AssignedCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  linkedSequenceName: string | null;
  followUpCadenceDays: number | null;
}

export function LeadCategoryPicker({
  leadId,
  availableCategories,
  assignedCategories,
}: {
  leadId: string;
  availableCategories: CategoryOption[];
  assignedCategories: AssignedCategory[];
}) {
  const [assignState, assignAction, assignPending] = useActionState<CategoryFormState, FormData>(
    assignLeadToCategory,
    {},
  );
  const [removeState, removeAction, removePending] = useActionState<CategoryFormState, FormData>(
    removeLeadFromCategory,
    {},
  );
  const [showPicker, setShowPicker] = useState(false);

  const assignedIds = new Set(assignedCategories.map((c) => c.id));
  const unassigned = availableCategories.filter((c) => c.active && !assignedIds.has(c.id));

  return (
    <div className="space-y-2.5">
      {/* Assigned categories */}
      {assignedCategories.length > 0 ? (
        <ul className="space-y-1.5">
          {assignedCategories.map((cat) => (
            <li
              key={cat.id}
              className="flex items-center gap-2 border border-rule rounded px-2.5 py-1.5 bg-paper"
              style={{ borderLeftColor: cat.color, borderLeftWidth: 3 }}
            >
              <span className="text-sm">{cat.icon}</span>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-ink">{cat.name}</span>
                {(cat.linkedSequenceName || cat.followUpCadenceDays) && (
                  <div className="text-[10px] text-ink-soft flex gap-2">
                    {cat.linkedSequenceName && <span>↻ {cat.linkedSequenceName}</span>}
                    {cat.followUpCadenceDays && <span>⏰ every {cat.followUpCadenceDays}d</span>}
                  </div>
                )}
              </div>
              <form action={removeAction}>
                <input type="hidden" name="leadId" value={leadId} />
                <input type="hidden" name="categoryId" value={cat.id} />
                <button
                  type="submit"
                  disabled={removePending}
                  className="text-xs text-stamp hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-soft">No categories assigned.</p>
      )}

      {/* Add category dropdown */}
      {unassigned.length > 0 && (
        <div>
          {!showPicker ? (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="text-xs font-semibold text-ink hover:underline"
            >
              + Add category
            </button>
          ) : (
            <form action={assignAction} className="space-y-2">
              <input type="hidden" name="leadId" value={leadId} />
              <select
                name="categoryId"
                className="w-full text-sm border border-rule bg-paper px-3 py-2 rounded font-mono"
                defaultValue=""
              >
                <option value="" disabled>Select a category...</option>
                {unassigned.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPicker(false)}
                  className="text-xs px-3 py-1.5 border border-rule rounded hover:bg-paper-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assignPending}
                  className="text-xs px-3 py-1.5 bg-ink text-paper rounded hover:opacity-90 disabled:opacity-50"
                >
                  {assignPending ? "Adding..." : "Add"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {assignState.message && (
        <p className={`text-xs ${assignState.ok ? "text-register" : "text-stamp"}`}>{assignState.message}</p>
      )}
      {removeState.message && (
        <p className={`text-xs ${removeState.ok ? "text-register" : "text-stamp"}`}>{removeState.message}</p>
      )}
    </div>
  );
}
