import { describe, it, expect } from "vitest";
import { nairaToKobo, generateReference } from "@/lib/paystack";

describe("nairaToKobo", () => {
  it("converts 1 naira to 100 kobo", () => {
    expect(nairaToKobo(1)).toBe(100);
  });

  it("converts 1500 naira to 150000 kobo", () => {
    expect(nairaToKobo(1500)).toBe(150000);
  });

  it("converts 0 naira to 0 kobo", () => {
    expect(nairaToKobo(0)).toBe(0);
  });

  it("converts large amounts", () => {
    expect(nairaToKobo(1000000)).toBe(100000000);
  });

  it("rounds floating point", () => {
    expect(nairaToKobo(1500.5)).toBe(150050);
  });
});

describe("generateReference", () => {
  it("generates a string with prefix", () => {
    const ref = generateReference("xsta_sub");
    expect(ref).toContain("xsta_sub_");
  });

  it("generates unique references", () => {
    const refs = new Set<string>();
    for (let i = 0; i < 100; i++) {
      refs.add(generateReference("test"));
    }
    expect(refs.size).toBe(100);
  });

  it("uses default prefix when none provided", () => {
    const ref = generateReference();
    expect(ref).toContain("xsta_");
  });

  it("contains timestamp and random components", () => {
    const ref = generateReference("prefix");
    const parts = ref.split("_");
    // prefix_timestamp_random
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });
});
