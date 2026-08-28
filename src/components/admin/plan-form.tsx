"use client";

import { useActionState } from "react";
import { createPlan, updatePlan, type SubFormState } from "@/app/actions/admin";

interface PlanData {
  id: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  maxUsers: number;
  maxLeads: number;
  features: string;
  position: number;
}

export function PlanForm({
  mode,
  plan,
}: {
  mode: "create" | "edit";
  plan?: PlanData;
}) {
  const action = mode === "create" ? createPlan : updatePlan;
  const [state, formAction, pending] = useActionState<SubFormState, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      {mode === "edit" && plan && (
        <input type="hidden" name="planId" value={plan.id} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
            Plan name
          </label>
          <input
            type="text"
            name="name"
            defaultValue={plan?.name ?? ""}
            placeholder="e.g. Starter, Pro, Enterprise"
            className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          />
        </div>
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
            Position (sort order)
          </label>
          <input
            type="number"
            name="position"
            defaultValue={plan?.position ?? 0}
            className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
            Monthly (₦)
          </label>
          <input
            type="number"
            name="priceMonthly"
            defaultValue={plan?.priceMonthly ?? 0}
            className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          />
        </div>
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
            Yearly (₦)
          </label>
          <input
            type="number"
            name="priceYearly"
            defaultValue={plan?.priceYearly ?? 0}
            className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          />
        </div>
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
            Max users (-1 = ∞)
          </label>
          <input
            type="number"
            name="maxUsers"
            defaultValue={plan?.maxUsers ?? -1}
            className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          />
        </div>
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
            Max leads (-1 = ∞)
          </label>
          <input
            type="number"
            name="maxLeads"
            defaultValue={plan?.maxLeads ?? -1}
            className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
          Features (JSON)
        </label>
        <textarea
          name="features"
          defaultValue={plan?.features ?? "{}"}
          rows={3}
          placeholder='{"sequences": true, "custom_fields": true}'
          className="w-full text-sm font-mono border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-semibold border border-ink rounded px-4 py-2.5 min-h-[44px] hover:bg-paper-2 active:bg-paper-2 disabled:opacity-50"
        >
          {pending ? "Saving…" : mode === "create" ? "Create plan" : "Update plan"}
        </button>
        {state.message && (
          <span className={`text-sm ${state.error ? "text-stamp" : "text-register"}`}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
