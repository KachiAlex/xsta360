import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";

// Mock nodemailer
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: "test-message-id" }),
    }),
  },
}));

// Ensure no SMTP creds so sendMail uses dev fallback
beforeAll(() => {
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
});

const { sendMail } = await import("@/lib/email");

describe("email sendMail", () => {
  const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  afterEach(() => {
    consoleSpy.mockClear();
  });

  it("logs to console in dev mode (no SMTP creds)", async () => {
    await sendMail("test@example.com", "Test Subject", "<p>Test</p>");
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("test@example.com"),
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Test Subject"),
    );
  });

  it("does not throw in dev mode", async () => {
    await expect(
      sendMail("user@test.com", "Hello", "<p>Hi</p>"),
    ).resolves.not.toThrow();
  });
});
