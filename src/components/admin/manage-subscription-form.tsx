"use client";

import { useActionState } from "react";
import { manageSubscription, type SubFormState } from "@/app/actions/admin";

export function ManageSubscriptionForm({
  orgId,
  currentSubId,
  currentPlanId,
  currentStatus,
  plans,
}: {
  orgId: string;
  currentSubId: string | null;
  currentPlanId: string | null;
  currentStatus: string | null;
  plans: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<SubFormState, FormData>(
    manageSubscription,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="subId" value={currentSubId ?? ""} />

      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
            Plan
          </label>
          <select
            name="planId"
            defaultValue={currentPlanId ?? ""}
            className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          >
            <option value="">— No plan (Free) —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-mono uppercase tracking-wider text-ink-soft mb-1.5">
            Status
          </label>
          <select
            name="status"
            defaultValue={currentStatus ?? "trialing"}
            className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          >
            <option value="trialing">Trialing</option>
            <option value="active">Active</option>
            <option value="past_due">Past due</option>
            <option value="canceled">Canceled</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="text-sm font-semibold border border-ink rounded px-4 py-2.5 min-h-[44px] hover:bg-paper-2 active:bg-paper-2 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      {state.message && (
        <p className={`text-sm px-3 py-2 rounded ${state.error ? "bg-stamp/10 text-stamp" : "bg-register/10 text-register"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
