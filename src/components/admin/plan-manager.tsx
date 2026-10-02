"use client";

import { useState } from "react";
import { PlanForm, type PlanData } from "@/components/admin/plan-form";
import { DeletePlanButton } from "@/components/admin/delete-plan-button";

export interface PlanRow extends PlanData {
  active: boolean;
  subscriberCount: number;
}

export function PlanManager({ plans }: { plans: PlanRow[] }) {
  const [selectedId, setSelectedId] = useState<string>(plans[0]?.id ?? "");
  const selected = plans.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      {/* Plan selector — pick a plan to view/edit */}
      <div className="bg-panel border border-rule rounded-md p-4">
        <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
          Select plan to edit
        </label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full sm:max-w-sm text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.billingInterval === "lifetime" ? " — one-time" : " — monthly"}
              {!p.active ? " (inactive)" : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Compact overview — all plans at a glance, click a row to edit it */}
      <div className="bg-panel border border-rule rounded-md divide-y divide-rule">
        {plans.map((p) => {
          const isSelected = p.id === selectedId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className={`w-full text-left px-4 py-3 flex items-center justify-between gap-3 flex-wrap transition-colors ${
                isSelected ? "bg-amber/5" : "hover:bg-paper-2"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-xs text-ink-soft w-6 shrink-0">
                  {p.position}
                </span>
                <span className="font-mono text-sm font-semibold truncate">{p.name}</span>
                {p.billingInterval === "lifetime" ? (
                  <span className="text-[10px] font-semibold text-amber bg-amber/10 px-1.5 py-0.5 rounded uppercase">
                    Lifetime
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-ink-soft bg-paper-2 px-1.5 py-0.5 rounded uppercase">
                    Monthly
                  </span>
                )}
                {!p.active && (
                  <span className="text-[10px] font-semibold text-stamp bg-stamp/10 px-1.5 py-0.5 rounded">
                    Inactive
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs font-mono text-ink-soft shrink-0">
                <span>
                  {p.currency}
                  {p.basePriceMonthly.toLocaleString()}
                  {p.billingInterval === "lifetime" ? " once" : "/mo"}
                  {p.billingInterval === "monthly" && p.perSeatPriceMonthly > 0
                    ? ` + ${p.currency}${p.perSeatPriceMonthly.toLocaleString()}/seat`
                    : ""}
                </span>
                <span>
                  {p.subscriberCount} sub{p.subscriberCount !== 1 ? "s" : ""}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected plan editor */}
      {selected && (
        <div className="bg-panel border border-rule rounded-md" key={selected.id}>
          <div className="px-4 py-3 border-b border-rule flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h3 className="font-mono text-sm uppercase tracking-wider m-0">
                Edit: {selected.name}
              </h3>
              <span className="text-[10px] font-mono text-ink-soft">
                {selected.subscriberCount} subscriber{selected.subscriberCount !== 1 ? "s" : ""}
              </span>
            </div>
            <DeletePlanButton planId={selected.id} planName={selected.name} />
          </div>

          <div className="px-4 py-3 bg-paper-2/50 border-b border-rule">
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft block">
                  {selected.billingInterval === "lifetime" ? "One-time price" : "Base (admin)"}
                </span>
                <span className="font-mono font-bold text-base">
                  {selected.currency}
                  {selected.basePriceMonthly.toLocaleString()}
                  <span className="text-xs text-ink-soft font-normal">
                    {selected.billingInterval === "lifetime" ? " once" : "/mo"}
                  </span>
                </span>
              </div>
              {selected.billingInterval === "monthly" && (
                <>
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft block">Per seat</span>
                    <span className="font-mono font-bold text-base">
                      {selected.currency}
                      {selected.perSeatPriceMonthly.toLocaleString()}
                      <span className="text-xs text-ink-soft font-normal">/mo</span>
                    </span>
                  </div>
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft block">Free trial</span>
                    <span className="font-mono font-bold text-base">
                      {selected.trialDays}
                      <span className="text-xs text-ink-soft font-normal"> days</span>
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="p-4">
            <PlanForm
              mode="edit"
              plan={{
                id: selected.id,
                name: selected.name,
                billingInterval: selected.billingInterval,
                basePriceMonthly: selected.basePriceMonthly,
                perSeatPriceMonthly: selected.perSeatPriceMonthly,
                trialDays: selected.trialDays,
                currency: selected.currency,
                features: selected.features,
                position: selected.position,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
