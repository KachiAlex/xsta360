"use client";

import { useActionState } from "react";
import { changeStage, type LeadFormState } from "@/app/actions/leads";
import { Select } from "@/components/ui/field";

export function StageSelect({
  leadId,
  stages,
  currentStageId,
}: {
  leadId: string;
  stages: { id: string; name: string; kind: string }[];
  currentStageId: string | null;
}) {
  const [state, action, pending] = useActionState<LeadFormState, FormData>(changeStage, {});

  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="leadId" value={leadId} />
      <Select
        name="toStageId"
        defaultValue={currentStageId ?? ""}
        disabled={pending}
        className="w-auto"
        onChange={(e) => {
          // Auto-submit on change for quick moves.
          if (e.currentTarget.form) {
            const form = e.currentTarget.form as HTMLFormElement & { requestSubmit: () => void };
            form.requestSubmit();
          }
        }}
      >
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>

      {/* If the selected target is a Lost stage, show reason fields. */}
      {state.errors?.lostReasonText && (
        <span className="text-xs text-stamp">{state.errors.lostReasonText[0]}</span>
      )}
      {state.message && <span className="text-xs text-stamp">{state.message}</span>}
    </form>
  );
}

/** Reason picker shown when moving to Lost — rendered alongside StageSelect via a sibling form. */
export function LostReasonFields({
  lostReasons,
}: {
  lostReasons: { id: string; label: string }[];
}) {
  return (
    <div className="space-y-2">
      <select name="lostReasonId" defaultValue="" className="text-sm border border-rule bg-paper rounded px-3 py-2 w-full">
        <option value="">Select a reason…</option>
        {lostReasons.map((r) => (
          <option key={r.id} value={r.id}>{r.label}</option>
        ))}
      </select>
      <input
        name="lostReasonText"
        placeholder="Or type a custom reason"
        className="text-sm border border-rule bg-paper rounded px-3 py-2 w-full"
      />
    </div>
  );
}
