"use client";

import { useActionState } from "react";
import { deletePlan, type SubFormState } from "@/app/actions/admin";

export function DeletePlanButton({ planId, planName }: { planId: string; planName: string }) {
  const [state, action, pending] = useActionState<SubFormState, FormData>(deletePlan, {});

  return (
    <div className="flex items-center gap-2">
      {state.message && (
        <span className={`text-xs ${state.error ? "text-stamp" : "text-register"}`}>
          {state.message}
        </span>
      )}
      <form
        action={action}
        onSubmit={(e) => {
          if (!confirm(`Delete plan "${planName}"? This cannot be undone.`)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="planId" value={planId} />
        <button
          type="submit"
          disabled={pending}
          className="text-xs font-semibold border border-stamp text-stamp rounded px-2.5 py-1.5 min-h-[32px] hover:bg-stamp/10 active:bg-stamp/10 disabled:opacity-50"
        >
          {pending ? "…" : "Delete"}
        </button>
      </form>
    </div>
  );
}
