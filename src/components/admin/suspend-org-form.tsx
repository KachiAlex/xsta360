"use client";

import { useActionState } from "react";
import { suspendOrg, type SubFormState } from "@/app/actions/admin";

export function SuspendOrgForm({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [state, action, pending] = useActionState<SubFormState, FormData>(
    suspendOrg,
    {},
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="orgId" value={orgId} />
      <p className="text-sm text-ink-soft m-0">
        Suspending an organization will prevent all members from signing in.
        This action can be reversed by reactivating.
      </p>
      <button
        type="submit"
        disabled={pending}
        className="text-sm font-semibold border border-stamp text-stamp rounded px-4 py-2.5 min-h-[44px] hover:bg-stamp/10 active:bg-stamp/10 disabled:opacity-50"
      >
        {pending ? "Working…" : `Suspend ${orgName}`}
      </button>
      {state.message && (
        <p className={`text-sm px-3 py-2 rounded ${state.error ? "bg-stamp/10 text-stamp" : "bg-register/10 text-register"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
