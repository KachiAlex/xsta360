"use client";

import { useActionState } from "react";
import { changePlan, type BillingFormState } from "@/app/actions/billing";

export interface PlanOption {
  id: string;
  name: string;
  basePriceMonthly: number;
  perSeatPriceMonthly: number;
  currency: string;
  maxMembers: number | null;
  features: { key: string; label: string; included: boolean }[];
}

export function PlanPicker({
  plans,
  currentPlanId,
}: {
  plans: PlanOption[];
  currentPlanId: string;
}) {
  const [state, formAction, pending] = useActionState<BillingFormState, FormData>(
    changePlan,
    {},
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {plans.map((p) => {
        const isCurrent = p.id === currentPlanId;
        return (
          <div
            key={p.id}
            className={`border rounded-md p-4 space-y-3 ${
              isCurrent ? "border-register bg-register/5" : "border-rule bg-paper"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-semibold">{p.name}</span>
              {isCurrent && (
                <span className="text-[10px] font-mono uppercase tracking-wider bg-register/15 text-register px-2 py-0.5 rounded">
                  Current
                </span>
              )}
            </div>
            <div className="text-sm">
              <span className="font-mono font-bold text-lg">
                {p.currency}{p.basePriceMonthly.toLocaleString()}
              </span>
              <span className="text-ink-soft">/mo</span>
              <span className="block text-xs text-ink-soft mt-0.5">
                + {p.currency}{p.perSeatPriceMonthly.toLocaleString()}/extra member
              </span>
            </div>
            <ul className="text-xs text-ink-soft space-y-1">
              <li>
                {p.maxMembers === null ? "Unlimited members" : `Up to ${p.maxMembers} members`}
              </li>
              {p.features.map((f) => (
                <li key={f.key} className={f.included ? "" : "opacity-50 line-through"}>
                  {f.label}
                </li>
              ))}
            </ul>
            {!isCurrent && (
              <form action={formAction}>
                <input type="hidden" name="planId" value={p.id} />
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full text-sm font-semibold bg-ink text-paper px-3 py-2 rounded hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Switching…" : `Switch to ${p.name}`}
                </button>
              </form>
            )}
          </div>
        );
      })}
      {state.message && (
        <p className={`sm:col-span-2 text-sm ${state.error ? "text-stamp" : "text-register"}`}>
          {state.message}
        </p>
      )}
    </div>
  );
}
