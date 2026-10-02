"use client";

import { useState } from "react";
import { useActionState } from "react";
import { createPlan, updatePlan, type SubFormState } from "@/app/actions/admin";

export interface PlanData {
  id: string;
  name: string;
  billingInterval: string;
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
  const [interval, setInterval] = useState(plan?.billingInterval ?? "monthly");
  const isLifetime = interval === "lifetime";

  return (
    <form action={formAction} className="space-y-3">
      {mode === "edit" && plan && (
        <input type="hidden" name="planId" value={plan.id} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
            Plan name
          </label>
          <input
            type="text"
            name="name"
            defaultValue={plan?.name ?? ""}
            placeholder="e.g. Starter, Pro, Lifetime"
            className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          />
        </div>
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
            Billing type
          </label>
          <select
            name="billingInterval"
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          >
            <option value="monthly">Monthly (recurring)</option>
            <option value="lifetime">Lifetime (one-time)</option>
          </select>
          <p className="text-[11px] text-ink-soft mt-1">
            {isLifetime ? "Single fixed payment, never renews" : "Billed every month"}
          </p>
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
            {isLifetime ? "One-time price" : "Base price / mo"}
          </label>
          <input
            type="number"
            name="basePriceMonthly"
            defaultValue={plan?.basePriceMonthly ?? (isLifetime ? 500000 : 1000)}
            min={0}
            className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          />
          <p className="text-[11px] text-ink-soft mt-1">
            {isLifetime ? "Charged once at checkout" : "What the workspace admin pays"}
          </p>
        </div>
        {!isLifetime && (
          <>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
                Per-seat price / mo
              </label>
              <input
                type="number"
                name="perSeatPriceMonthly"
                defaultValue={plan?.perSeatPriceMonthly ?? 500}
                min={0}
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
                min={0}
                className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
              />
              <p className="text-[11px] text-ink-soft mt-1">0 = no free trial</p>
            </div>
          </>
        )}
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
        {isLifetime ? (
          <div className="font-mono text-xs text-ink-soft">
            {plan?.currency ?? "₦"}
            {(plan?.basePriceMonthly ?? 500000).toLocaleString()} — charged once, lifetime access, no renewals
          </div>
        ) : (
          <>
            <div className="font-mono text-xs text-ink-soft">
              {plan?.currency ?? "₦"}
              {(plan?.basePriceMonthly ?? 1000).toLocaleString()}
              {" (admin) + "}
              {plan?.currency ?? "₦"}
              {(plan?.perSeatPriceMonthly ?? 500).toLocaleString()}
              {" × additional members"}
            </div>
            <div className="text-xs text-ink-soft mt-1">
              e.g. 4 members = {plan?.currency ?? "₦"}
              {((plan?.basePriceMonthly ?? 1000) + 3 * (plan?.perSeatPriceMonthly ?? 500)).toLocaleString()}
              /mo
            </div>
          </>
        )}
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
