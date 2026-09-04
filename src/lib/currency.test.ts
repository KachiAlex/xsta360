import { describe, it, expect } from "vitest";
import { normalizeCurrency, formatPrice } from "@/lib/currency";

describe("normalizeCurrency", () => {
  it("returns ₦ for valid naira symbol", () => {
    expect(normalizeCurrency("₦")).toBe("₦");
  });

  it("returns ₦ for ??? (corrupted value)", () => {
    expect(normalizeCurrency("???")).toBe("₦");
  });

  it("returns ₦ for empty string", () => {
    expect(normalizeCurrency("")).toBe("₦");
  });

  it("returns ₦ for null", () => {
    expect(normalizeCurrency(null)).toBe("₦");
  });

  it("returns ₦ for undefined", () => {
    expect(normalizeCurrency(undefined)).toBe("₦");
  });

  it("preserves $ for dollar", () => {
    expect(normalizeCurrency("$")).toBe("$");
  });

  it("preserves € for euro", () => {
    expect(normalizeCurrency("€")).toBe("€");
  });

  it("preserves £ for pound", () => {
    expect(normalizeCurrency("£")).toBe("£");
  });

  it("handles whitespace-only string", () => {
    expect(normalizeCurrency("   ")).toBe("₦");
  });
});

describe("formatPrice", () => {
  it("formats naira with symbol", () => {
    const result = formatPrice(1500, "₦");
    expect(result).toContain("₦");
    expect(result).toContain("1,500");
  });

  it("formats with thousands separator", () => {
    const result = formatPrice(15000, "₦");
    expect(result).toContain("15,000");
  });

  it("formats zero", () => {
    const result = formatPrice(0, "₦");
    expect(result).toContain("0");
  });

  it("handles large numbers", () => {
    const result = formatPrice(1000000, "₦");
    expect(result).toContain("1,000,000");
  });

  it("defaults to ₦ when currency is null", () => {
    const result = formatPrice(500, null);
    expect(result).toContain("₦");
  });

  it("defaults to ₦ when currency is ???", () => {
    const result = formatPrice(500, "???");
    expect(result).toContain("₦");
  });

  it("supports compact format for thousands", () => {
    const result = formatPrice(1500, "₦", { compact: true });
    expect(result).toContain("1.5K");
  });

  it("supports compact format for millions", () => {
    const result = formatPrice(1000000, "₦", { compact: true });
    expect(result).toContain("1.0M");
  });
});
