import { describe, it, expect } from "vitest";
import { googleCalendarUrl, reminderCalendarUrl } from "@/lib/calendar";

describe("googleCalendarUrl", () => {
  it("generates a valid Google Calendar URL", () => {
    const url = googleCalendarUrl({
      title: "Test Event",
      startDate: new Date("2026-01-15T10:00:00Z"),
    });
    expect(url).toContain("calendar.google.com");
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("text=Test+Event");
  });

  it("includes start and end dates", () => {
    const url = googleCalendarUrl({
      title: "Meeting",
      startDate: new Date("2026-01-15T10:00:00Z"),
      endDate: new Date("2026-01-15T11:00:00Z"),
    });
    expect(url).toContain("dates=20260115T100000Z");
    expect(url).toContain("20260115T110000Z");
  });

  it("defaults to 30-minute duration when no end date", () => {
    const url = googleCalendarUrl({
      title: "Quick Call",
      startDate: new Date("2026-01-15T10:00:00Z"),
    });
    expect(url).toContain("dates=20260115T100000Z");
    expect(url).toContain("20260115T103000Z");
  });

  it("includes description when provided", () => {
    const url = googleCalendarUrl({
      title: "Event",
      startDate: new Date("2026-01-15T10:00:00Z"),
      description: "Test description",
    });
    expect(url).toContain("details=Test+description");
  });

  it("includes location when provided", () => {
    const url = googleCalendarUrl({
      title: "Event",
      startDate: new Date("2026-01-15T10:00:00Z"),
      location: "Lagos, Nigeria",
    });
    expect(url).toContain("location=Lagos%2C+Nigeria");
  });
});

describe("reminderCalendarUrl", () => {
  it("creates a follow-up event with lead name", () => {
    const url = reminderCalendarUrl({
      leadName: "Tunde Adeyemi",
      dueAt: new Date("2026-01-15T10:00:00Z"),
    });
    expect(url).toContain("text=Follow-up%3A+Tunde+Adeyemi");
  });

  it("includes company in description when provided", () => {
    const url = reminderCalendarUrl({
      leadName: "John",
      leadCompany: "Acme Corp",
      dueAt: new Date("2026-01-15T10:00:00Z"),
    });
    expect(url).toContain("Acme+Corp");
  });

  it("includes note in description when provided", () => {
    const url = reminderCalendarUrl({
      leadName: "John",
      dueAt: new Date("2026-01-15T10:00:00Z"),
      note: "Call about proposal",
    });
    expect(url).toContain("Call+about+proposal");
  });

  it("includes phone in description when provided", () => {
    const url = reminderCalendarUrl({
      leadName: "John",
      dueAt: new Date("2026-01-15T10:00:00Z"),
      leadPhone: "+2348031234567",
    });
    expect(url).toContain("2348031234567");
  });
});
