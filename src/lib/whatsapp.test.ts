import { describe, it, expect } from "vitest";
import {
  whatsappClickToChat,
  formatReminderMessage,
  formatLeadMessage,
} from "@/lib/whatsapp";

describe("whatsappClickToChat", () => {
  it("generates wa.me link with cleaned phone", () => {
    const url = whatsappClickToChat("+234 803 123 4567", "Hello");
    expect(url).toContain("wa.me/2348031234567");
    expect(url).toContain("?text=");
  });

  it("encodes message text", () => {
    const url = whatsappClickToChat("08031234567", "Hello world!");
    expect(url).toContain("Hello%20world");
  });

  it("handles phone with dashes", () => {
    const url = whatsappClickToChat("+234-803-123-4567", "Test");
    expect(url).toContain("wa.me/2348031234567");
  });

  it("handles empty phone gracefully", () => {
    const url = whatsappClickToChat("", "Test");
    expect(url).toContain("wa.me/");
  });
});

describe("formatReminderMessage", () => {
  it("formats a reminder with all fields", () => {
    const msg = formatReminderMessage("Tunde Adeyemi", "Call to follow up", "Xsta360");
    expect(msg).toContain("Tunde Adeyemi");
    expect(msg).toContain("Call to follow up");
    expect(msg).toContain("Xsta360");
    expect(msg).toContain("🔔");
  });

  it("handles empty note", () => {
    const msg = formatReminderMessage("John", "", "MyOrg");
    expect(msg).toContain("John");
    expect(msg).toContain("MyOrg");
  });
});

describe("formatLeadMessage", () => {
  it("appends org name as signature", () => {
    const msg = formatLeadMessage("Hello there!", "Xsta360");
    expect(msg).toContain("Hello there!");
    expect(msg).toContain("— Xsta360");
  });

  it("preserves message body as-is", () => {
    const body = "Hi *bold* _italic_ text";
    const msg = formatLeadMessage(body, "Org");
    expect(msg).toContain(body);
  });
});
