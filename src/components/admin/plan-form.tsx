"use client";

import { useActionState } from "react";
import { createPlan, updatePlan, type SubFormState } from "@/app/actions/admin";

interface PlanData {
  id: string;
  name: string;
  basePriceMonthly: number;
  perSeatPriceMonthly: number;
  trialDays: number;
  currency: string;
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
            Currency symbol
          </label>
          <input
            type="text"
            name="currency"
            defaultValue={plan?.currency ?? "₦"}
            maxLength={3}
            className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
            Base price / mo
          </label>
          <input
            type="number"
            name="basePriceMonthly"
            defaultValue={plan?.basePriceMonthly ?? 1000}
            className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          />
          <p className="text-[11px] text-ink-soft mt-1">What the workspace admin pays</p>
        </div>
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
            Per-seat price / mo
          </label>
          <input
            type="number"
            name="perSeatPriceMonthly"
            defaultValue={plan?.perSeatPriceMonthly ?? 500}
            className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          />
          <p className="text-[11px] text-ink-soft mt-1">Each additional member</p>
        </div>
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
            Trial days
          </label>
          <input
            type="number"
            name="trialDays"
            defaultValue={plan?.trialDays ?? 30}
            className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          />
          <p className="text-[11px] text-ink-soft mt-1">0 = no free trial</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
            Features (JSON)
          </label>
          <input
            type="text"
            name="features"
            defaultValue={plan?.features ?? "{}"}
            placeholder='{"sequences": true}'
            className="w-full text-sm font-mono border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          />
        </div>
      </div>

      {/* Pricing preview */}
      <div className="bg-paper-2 rounded p-3 text-sm">
        <div className="font-mono text-[11px] uppercase tracking-wider text-ink-soft mb-1.5">
          Billing preview
        </div>
        <div className="font-mono text-xs text-ink-soft">
          <span id="preview-currency">{plan?.currency ?? "₦"}</span>
          <span id="preview-base">{plan?.basePriceMonthly ?? 1000}</span>
          {" (admin) + "}
          <span id="preview-currency2">{plan?.currency ?? "₦"}</span>
          <span id="preview-seat">{plan?.perSeatPriceMonthly ?? 500}</span>
          {" × additional members"}
        </div>
        <div className="text-xs text-ink-soft mt-1">
          e.g. 4 members = <span id="preview-currency3">{plan?.currency ?? "₦"}</span>
          <span id="preview-total">
            {(plan?.basePriceMonthly ?? 1000) + 3 * (plan?.perSeatPriceMonthly ?? 500)}
          </span>
          /mo
        </div>
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
