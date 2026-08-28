"use client";

import { useActionState } from "react";
import { suspendUser, reactivateUser, type SubFormState } from "@/app/actions/admin";

export function UserActionButtons({
  userId,
  suspended,
}: {
  userId: string;
  suspended: boolean;
}) {
  const [state, action, pending] = useActionState<SubFormState, FormData>(
    suspended ? reactivateUser : suspendUser,
    {},
  );

  return (
    <div className="flex items-center gap-2 justify-end">
      <form action={action}>
        <input type="hidden" name="userId" value={userId} />
        <button
          type="submit"
          disabled={pending}
          className={`text-xs font-semibold border rounded px-2.5 py-1.5 min-h-[32px] active:bg-paper-2 disabled:opacity-50 ${
            suspended
              ? "border-register text-register hover:bg-register/10"
              : "border-stamp text-stamp hover:bg-stamp/10"
          }`}
        >
          {pending ? "…" : suspended ? "Reactivate" : "Suspend"}
        </button>
      </form>
      {state.message && (
        <span className={`text-xs ${state.error ? "text-stamp" : "text-register"}`}>
          {state.message}
        </span>
      )}
    </div>
  );
}
