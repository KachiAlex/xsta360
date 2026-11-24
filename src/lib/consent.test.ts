import { describe, it, expect } from "vitest";
import { getConsentAction } from "@/lib/consent";

describe("getConsentAction", () => {
  it("detects opt-out keywords", () => {
    for (const t of ["STOP", "stop", "Stop!", "stop.", "unsubscribe", "CANCEL", "end", "quit", "opt out", "opt-out", "remove me"]) {
      expect(getConsentAction(t)).toBe("out");
    }
  });

  it("detects opt-in keywords", () => {
    for (const t of ["START", "start", "unstop", "subscribe", "opt in", "optin"]) {
      expect(getConsentAction(t)).toBe("in");
    }
  });

  it("ignores keywords embedded in sentences", () => {
    expect(getConsentAction("can you stop by Friday?")).toBeNull();
    expect(getConsentAction("please unsubscribe me from this list")).toBeNull();
    expect(getConsentAction("I want to start over")).toBeNull();
    expect(getConsentAction("")).toBeNull();
    expect(getConsentAction("hello there")).toBeNull();
  });
});
