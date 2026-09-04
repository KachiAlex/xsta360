"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { changePlan, type BillingFormState } from "@/app/actions/billing";
import { Price } from "@/components/app/price";
import { Modal } from "@/components/ui/modal";

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
  memberCount,
  hasSavedCard,
}: {
  plans: PlanOption[];
  currentPlanId: string;
  memberCount: number;
  hasSavedCard: boolean;
}) {
  const [state, formAction, pending] = useActionState<BillingFormState, FormData>(
    changePlan,
    {},
  );
  const [selectedPlan, setSelectedPlan] = useState<PlanOption | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const router = useRouter();

  const additionalMembers = Math.max(0, memberCount - 1);

  // Handle redirect / checkout responses from the server action.
  useEffect(() => {
    if (state.redirectUrl) {
      setRedirecting(true);
      router.push(state.redirectUrl);
    }
  }, [state.redirectUrl, router]);

  // Close modal on success message (downgrade or saved-card charge).
  useEffect(() => {
    if (state.message && !state.error && !state.redirectUrl) {
      setSelectedPlan(null);
    }
  }, [state.message, state.error, state.redirectUrl]);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((p) => {
          const isCurrent = p.id === currentPlanId;
          const newMonthly = p.basePriceMonthly + additionalMembers * p.perSeatPriceMonthly;
          const currentPlan = plans.find((x) => x.id === currentPlanId);
          const currentMonthly = currentPlan
            ? currentPlan.basePriceMonthly + additionalMembers * currentPlan.perSeatPriceMonthly
            : 0;
          const isUpgrade = newMonthly > currentMonthly;

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
                <span className="font-bold text-lg">
                  <Price amount={p.basePriceMonthly} currency={p.currency} />
                </span>
                <span className="text-ink-soft">/mo</span>
                <span className="block text-xs text-ink-soft mt-0.5">
                  + <Price amount={p.perSeatPriceMonthly} currency={p.currency} />/extra member
                </span>
              </div>
              <ul className="text-xs space-y-1">
                <li className="text-ink-soft">
                  {p.maxMembers === null ? "✓ Unlimited members" : `✓ Up to ${p.maxMembers} members`}
                </li>
                {p.features.map((f) => (
                  <li
                    key={f.key}
                    className={f.included ? "text-ink" : "text-ink-soft/50 line-through"}
                  >
                    {f.included ? "✓ " : "× "}{f.label}
                  </li>
                ))}
              </ul>
              {!isCurrent && (
                <button
                  type="button"
                  onClick={() => setSelectedPlan(p)}
                  disabled={pending}
                  className="w-full text-sm font-semibold bg-ink text-paper px-3 py-2 rounded hover:opacity-90 disabled:opacity-50"
                >
                  {isUpgrade ? `Upgrade to ${p.name}` : `Switch to ${p.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {state.message && (
        <p className={`text-sm mt-3 ${state.error ? "text-stamp" : "text-register"}`}>
          {state.message}
        </p>
      )}

      {selectedPlan && (
        <Modal
          open={!!selectedPlan}
          onClose={() => setSelectedPlan(null)}
          title={`Switch to ${selectedPlan.name}`}
          sub="Review your new plan and confirm."
        >
          <div className="space-y-4">
            <div className="border border-rule rounded-md p-3 bg-paper space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-ink-soft">Base price</span>
                <span>
                  <Price amount={selectedPlan.basePriceMonthly} currency={selectedPlan.currency} />/mo
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-ink-soft">Extra members</span>
                <span>{additionalMembers} × <Price amount={selectedPlan.perSeatPriceMonthly} currency={selectedPlan.currency} />/mo</span>
              </div>
              <div className="border-t border-rule pt-2 flex justify-between font-semibold">
                <span>New monthly total</span>
                <span className="text-register">
                  <Price
                    amount={selectedPlan.basePriceMonthly + additionalMembers * selectedPlan.perSeatPriceMonthly}
                    currency={selectedPlan.currency}
                  />
                  /mo
                </span>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-mono uppercase tracking-wider mb-2">Plan features</h4>
              <ul className="text-sm space-y-1">
                <li className="text-ink-soft">
                  {selectedPlan.maxMembers === null
                    ? "✓ Unlimited members"
                    : `✓ Up to ${selectedPlan.maxMembers} members`}
                </li>
                {selectedPlan.features.map((f) => (
                  <li
                    key={f.key}
                    className={f.included ? "text-ink" : "text-ink-soft/50 line-through"}
                  >
                    {f.included ? "✓ " : "× "}{f.label}
                  </li>
                ))}
              </ul>
            </div>

            {(() => {
              const currentPlan = plans.find((x) => x.id === currentPlanId);
              const currentMonthly = currentPlan
                ? currentPlan.basePriceMonthly + additionalMembers * currentPlan.perSeatPriceMonthly
                : 0;
              const newMonthly = selectedPlan.basePriceMonthly + additionalMembers * selectedPlan.perSeatPriceMonthly;
              const isUpgrade = newMonthly > currentMonthly;

              if (isUpgrade) {
                return (
                  <div className="bg-amber/10 border border-amber/20 rounded-md px-3 py-2.5 text-xs text-[#9c6014]">
                    {hasSavedCard ? (
                      <>This is an upgrade. We&rsquo;ll charge <strong><Price amount={newMonthly} currency={selectedPlan.currency} /></strong> to your saved card now.</>
                    ) : (
                      <>This is an upgrade. You&rsquo;ll be redirected to Paystack to pay <strong><Price amount={newMonthly} currency={selectedPlan.currency} /></strong> now.</>
                    )}
                  </div>
                );
              }
              return (
                <p className="text-xs text-ink-soft">
                  This is a downgrade. The new rate of <Price amount={newMonthly} currency={selectedPlan.currency} />/mo applies at your next billing date — no charge now.
                </p>
              );
            })()}

            <form action={formAction} className="pt-2">
              <input type="hidden" name="planId" value={selectedPlan.id} />
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedPlan(null)}
                  className="flex-1 px-4 py-2 text-sm font-semibold border border-rule rounded hover:bg-paper-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || redirecting}
                  className="flex-1 px-4 py-2 text-sm font-semibold bg-ink text-paper rounded hover:opacity-90 disabled:opacity-50"
                >
                  {pending || redirecting ? "Processing…" : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
