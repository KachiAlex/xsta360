"use client";

import { normalizeCurrency } from "@/lib/currency";

export function Price({
  amount,
  currency,
  className = "",
  digitsClassName = "tabular-nums",
}: {
  amount: number;
  currency: string | null | undefined;
  className?: string;
  digitsClassName?: string;
}) {
  const symbol = normalizeCurrency(currency);
  const formatted = amount.toLocaleString("en-US");
  return (
    <span className={className}>
      <span className="font-sans">{symbol}</span>
      <span className={digitsClassName}>{formatted}</span>
    </span>
  );
}
