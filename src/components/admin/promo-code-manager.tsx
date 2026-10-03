"use client";

import { useActionState } from "react";
import { createPromoCode, togglePromoCode, deletePromoCode, type SubFormState } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";

export interface PromoRow {
  id: string;
  code: string;
  planName: string;
  freeDays: number;
  maxRedemptions: number | null;
  redeemedCount: number;
  expiresAt: string | null;
  active: boolean;
}

function CreateForm({ plans }: { plans: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<SubFormState, FormData>(createPromoCode, {});

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <Label>Code</Label>
          <Input name="code" placeholder="LAUNCH90" autoComplete="off" className="uppercase" />
        </div>
        <div>
          <Label>Plan granted</Label>
          <select
            name="planId"
            className="w-full text-sm border border-rule bg-panel rounded px-3 py-2.5 min-h-[44px]"
          >
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label>Free days</Label>
          <Input name="freeDays" type="number" min={1} defaultValue={90} />
        </div>
        <div>
          <Label>Max uses <span className="text-ink-soft font-normal">(blank = unlimited)</span></Label>
          <Input name="maxRedemptions" type="number" min={1} placeholder="∞" />
        </div>
        <div>
          <Label>Expires <span className="text-ink-soft font-normal">(blank = never)</span></Label>
          <Input name="expiresAt" type="date" />
        </div>
      </div>
      {state.message && (
        <p className={`text-xs ${state.error ? "text-stamp" : "text-register"}`}>{state.message}</p>
      )}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Creating…" : "Create code"}
      </Button>
    </form>
  );
}

function RowActions({ promo }: { promo: PromoRow }) {
  const [toggleState, toggleAction, toggling] = useActionState<SubFormState, FormData>(togglePromoCode, {});
  const [deleteState, deleteAction, deleting] = useActionState<SubFormState, FormData>(deletePromoCode, {});
  const msg = toggleState.message ?? deleteState.message;
  const err = toggleState.error ?? deleteState.error;

  return (
    <div className="flex items-center gap-2 shrink-0">
      {msg && <span className={`text-xs ${err ? "text-stamp" : "text-register"}`}>{msg}</span>}
      <form action={toggleAction}>
        <input type="hidden" name="promoId" value={promo.id} />
        <button
          type="submit"
          disabled={toggling}
          className="text-xs font-semibold border border-rule rounded px-2.5 py-1.5 min-h-[32px] hover:bg-paper-2 disabled:opacity-50"
        >
          {toggling ? "…" : promo.active ? "Deactivate" : "Reactivate"}
        </button>
      </form>
      {promo.redeemedCount === 0 && (
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!confirm(`Delete promo code "${promo.code}"?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="promoId" value={promo.id} />
          <button
            type="submit"
            disabled={deleting}
            className="text-xs font-semibold border border-stamp text-stamp rounded px-2.5 py-1.5 min-h-[32px] hover:bg-stamp/10 disabled:opacity-50"
          >
            {deleting ? "…" : "Delete"}
          </button>
        </form>
      )}
    </div>
  );
}

export function PromoCodeManager({
  promos,
  plans,
}: {
  promos: PromoRow[];
  plans: { id: string; name: string }[];
}) {
  return (
    <div className="space-y-4">
      {/* Create a code */}
      <div className="bg-panel border border-rule rounded-md">
        <div className="px-4 py-3 border-b border-rule">
          <h2 className="font-mono text-sm uppercase tracking-wider m-0">Create promo code</h2>
        </div>
        <div className="p-4">
          <CreateForm plans={plans} />
        </div>
      </div>

      {/* Existing codes */}
      {promos.length > 0 && (
        <div className="bg-panel border border-rule rounded-md divide-y divide-rule">
          {promos.map((p) => (
            <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 min-w-0 flex-wrap">
                <span className="font-mono text-sm font-bold">{p.code}</span>
                <span className="text-xs text-ink-soft">
                  {p.freeDays}d free · {p.planName}
                </span>
                <span className="text-xs font-mono text-ink-soft">
                  {p.redeemedCount}{p.maxRedemptions !== null ? `/${p.maxRedemptions}` : ""} used
                </span>
                {p.expiresAt && (
                  <span className="text-xs text-ink-soft">
                    expires {new Date(p.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
                {!p.active && (
                  <span className="text-[10px] font-semibold text-stamp bg-stamp/10 px-1.5 py-0.5 rounded">
                    Inactive
                  </span>
                )}
              </div>
              <RowActions promo={p} />
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-soft">
        Share codes directly or as a signup link: <code className="font-mono">/signup?promo=CODE</code>.
        Existing workspaces redeem from their Billing page. Each workspace can redeem a code once.
      </p>
    </div>
  );
}
