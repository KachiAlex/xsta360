"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  type CategoryFormState,
} from "@/app/actions/categories";
import { Button } from "@/components/ui/button";
import { Label, Input, Textarea, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";

export interface CategoryItem {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  linkedSequenceId: string | null;
  linkedSequenceName: string | null;
  defaultAssigneeId: string | null;
  defaultAssigneeName: string | null;
  followUpCadenceDays: number | null;
  active: boolean;
  leadCount: number;
}

export interface SequenceOption {
  id: string;
  name: string;
}

export interface MemberOption {
  id: string;
  name: string;
}

const ICONS = ["🏷️", "🏠", "💻", "🔁", "🔥", "⭐", "💼", "📞", "📧", "🤝", "📈", "🎯", "🚀", "💎", "🏆"];
const COLORS = ["#B23A2E", "#1E2A22", "#4A5750", "#2563EB", "#059669", "#D97706", "#DC2626", "#7C3AED", "#0891B2", "#DB2777"];

export function CategoryList({
  categories,
  sequences,
  members,
}: {
  categories: CategoryItem[];
  sequences: SequenceOption[];
  members: MemberOption[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {/* Create button */}
      {!showForm && (
        <button
          type="button"
          onClick={() => { setShowForm(true); setEditingId(null); }}
          className="text-sm font-semibold text-ink hover:underline"
        >
          + New category
        </button>
      )}

      {/* Create/Edit form */}
      {showForm && (
        <CategoryForm
          sequences={sequences}
          members={members}
          editingCategory={editingId ? categories.find((c) => c.id === editingId) ?? null : null}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
        />
      )}

      {/* Category cards */}
      {categories.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {categories.map((cat) => (
            <CategoryCard
              key={cat.id}
              category={cat}
              onEdit={() => { setEditingId(cat.id); setShowForm(true); }}
            />
          ))}
        </div>
      ) : (
        !showForm && (
          <div className="text-center py-12 text-ink-soft text-sm">
            No categories yet. Create one to start grouping leads with automated workflows.
          </div>
        )
      )}
    </div>
  );
}

function CategoryCard({ category, onEdit }: { category: CategoryItem; onEdit: () => void }) {
  const [deleteState, deleteAction, deletePending] = useActionState<CategoryFormState, FormData>(
    deleteCategory,
    {},
  );

  return (
    <div className="border border-rule rounded p-4 bg-paper" style={{ borderLeftColor: category.color, borderLeftWidth: 3 }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{category.icon}</span>
          <div>
            <h3 className="text-sm font-semibold text-ink">{category.name}</h3>
            {category.description && (
              <p className="text-xs text-ink-soft mt-0.5">{category.description}</p>
            )}
          </div>
        </div>
        <Badge tone={category.active ? "today" : "lost"}>
          {category.leadCount} {category.leadCount === 1 ? "lead" : "leads"}
        </Badge>
      </div>

      {/* Workflow automations */}
      <div className="mt-3 space-y-1 text-xs text-ink-soft">
        {category.linkedSequenceName && (
          <div className="flex items-center gap-1.5">
            <span>↻</span>
            <span>Auto-sequence: <span className="text-ink font-medium">{category.linkedSequenceName}</span></span>
          </div>
        )}
        {category.defaultAssigneeName && (
          <div className="flex items-center gap-1.5">
            <span>👤</span>
            <span>Auto-assign: <span className="text-ink font-medium">{category.defaultAssigneeName}</span></span>
          </div>
        )}
        {category.followUpCadenceDays && (
          <div className="flex items-center gap-1.5">
            <span>⏰</span>
            <span>Follow-up every <span className="text-ink font-medium">{category.followUpCadenceDays} day{category.followUpCadenceDays !== 1 ? "s" : ""}</span></span>
          </div>
        )}
        {!category.linkedSequenceName && !category.defaultAssigneeName && !category.followUpCadenceDays && (
          <p className="italic">No automations configured</p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-3">
        <button type="button" onClick={onEdit} className="text-xs font-semibold text-ink-soft hover:text-ink">
          Edit
        </button>
        <form action={deleteAction}>
          <input type="hidden" name="id" value={category.id} />
          <button type="submit" disabled={deletePending} className="text-xs font-semibold text-stamp hover:underline disabled:opacity-50">
            Delete
          </button>
        </form>
      </div>
      {deleteState.message && (
        <p className={`text-xs mt-1 ${deleteState.ok ? "text-register" : "text-stamp"}`}>{deleteState.message}</p>
      )}
    </div>
  );
}

function CategoryForm({
  sequences,
  members,
  editingCategory,
  onCancel,
}: {
  sequences: SequenceOption[];
  members: MemberOption[];
  editingCategory: CategoryItem | null;
  onCancel: () => void;
}) {
  const action = editingCategory ? updateCategory : createCategory;
  const [state, formAction, pending] = useActionState<CategoryFormState, FormData>(action, {});
  const [icon, setIcon] = useState(editingCategory?.icon ?? "🏷️");
  const [color, setColor] = useState(editingCategory?.color ?? "#4A5750");

  return (
    <form action={formAction} className="bg-paper-2 rounded p-4 space-y-3 border border-rule">
      {editingCategory && <input type="hidden" name="id" value={editingCategory.id} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Name</Label>
          <Input name="name" defaultValue={editingCategory?.name ?? ""} placeholder="e.g. Real Estate Buyer" />
          {state.errors?.name && <p className="text-xs text-stamp mt-1">{state.errors.name[0]}</p>}
        </div>
        <div>
          <Label>Follow-up cadence (days)</Label>
          <Input name="followUpCadenceDays" type="number" defaultValue={editingCategory?.followUpCadenceDays ?? ""} placeholder="e.g. 3" />
        </div>
      </div>

      <div>
        <Label>Description</Label>
        <Textarea name="description" rows={2} defaultValue={editingCategory?.description ?? ""} placeholder="What kind of leads go in this category?" />
      </div>

      {/* Icon picker */}
      <div>
        <Label>Icon</Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={() => setIcon(ic)}
              className={`w-8 h-8 rounded text-lg flex items-center justify-center border ${icon === ic ? "border-ink bg-paper" : "border-rule"}`}
            >
              {ic}
            </button>
          ))}
        </div>
        <input type="hidden" name="icon" value={icon} />
      </div>

      {/* Color picker */}
      <div>
        <Label>Color</Label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-full border-2 ${color === c ? "border-ink" : "border-transparent"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <input type="hidden" name="color" value={color} />
      </div>

      {/* Workflow automations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-rule">
        <div>
          <Label>Auto-enroll sequence</Label>
          <Select name="linkedSequenceId" defaultValue={editingCategory?.linkedSequenceId ?? ""}>
            <option value="">None</option>
            {sequences.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Auto-assign to</Label>
          <Select name="defaultAssigneeId" defaultValue={editingCategory?.defaultAssigneeId ?? ""}>
            <option value="">Keep current</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : editingCategory ? "Update category" : "Create category"}
        </Button>
      </div>

      {state.message && (
        <p className={`text-xs ${state.ok ? "text-register" : "text-stamp"}`}>{state.message}</p>
      )}
    </form>
  );
}
