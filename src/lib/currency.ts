/**
 * Normalize a currency symbol for display.
 * Some legacy plan rows have "???" stored; fall back to ₦ (Naira).
 */
export function normalizeCurrency(symbol: string | null | undefined): string {
  if (!symbol || symbol.trim() === "" || symbol.includes("?")) return "₦";
  return symbol;
}

/**
 * Format a price with the given currency symbol.
 * Uses a sans-serif font for the symbol so it renders reliably,
 * and a tabular-nums style for the digits.
 */
export function formatPrice(
  amount: number,
  currency: string | null | undefined,
  opts?: { fractionDigits?: number; compact?: boolean },
): string {
  const symbol = normalizeCurrency(currency);
  const value = opts?.compact ? compactNumber(amount) : amount.toLocaleString("en-US");
  return `${symbol}${value}`;
}

function compactNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("en-US");
}
