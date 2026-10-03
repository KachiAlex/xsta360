"use client";

import { useActionState } from "react";
import { redeemPromoCode, type BillingFormState } from "@/app/actions/billing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

export function PromoRedeem() {
  const [state, action, pending] = useActionState<BillingFormState, FormData>(redeemPromoCode, {});

  return (
    <form action={action} className="flex flex-col sm:flex-row gap-2 sm:items-end">
      <div className="flex-1">
        <Input
          name="promoCode"
          placeholder="Enter promo code"
          autoComplete="off"
          className="uppercase"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Applying…" : "Apply code"}
      </Button>
      {state.message && (
        <p className={`text-xs sm:basis-full ${state.error ? "text-stamp" : "text-register"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
