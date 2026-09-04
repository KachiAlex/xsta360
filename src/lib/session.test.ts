import { describe, it, expect, beforeAll } from "vitest";

// Set env before importing
beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-key-for-vitest-1234567890";
});

// Dynamic import after env is set
const { encrypt, decrypt } = await import("@/lib/session");

describe("session encrypt/decrypt", () => {
  const payload = {
    userId: "user-uuid-123",
    orgId: "org-uuid-456",
    role: "admin" as const,
    isSuperadmin: false,
    tokenVersion: 0,
  };

  it("encrypts payload into a JWT string", async () => {
    const token = await encrypt(payload);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // header.payload.signature
  });

  it("decrypts a valid token back to payload", async () => {
    const token = await encrypt(payload);
    const decoded = await decrypt(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.userId).toBe(payload.userId);
    expect(decoded?.orgId).toBe(payload.orgId);
    expect(decoded?.role).toBe("admin");
    expect(decoded?.isSuperadmin).toBe(false);
    expect(decoded?.expiresAt).toBeGreaterThan(Date.now());
  });

  it("returns null for invalid token", async () => {
    const result = await decrypt("invalid.token.here");
    expect(result).toBeNull();
  });

  it("returns null for empty token", async () => {
    const result = await decrypt("");
    expect(result).toBeNull();
  });

  it("returns null for undefined token", async () => {
    const result = await decrypt(undefined);
    expect(result).toBeNull();
  });

  it("preserves tokenVersion", async () => {
    const token = await encrypt({ ...payload, tokenVersion: 5 });
    const decoded = await decrypt(token);
    expect(decoded?.tokenVersion).toBe(5);
  });

  it("preserves superadmin flag", async () => {
    const token = await encrypt({ ...payload, isSuperadmin: true });
    const decoded = await decrypt(token);
    expect(decoded?.isSuperadmin).toBe(true);
  });

  it("sets expiry 7 days in the future", async () => {
    const now = Date.now();
    const token = await encrypt(payload);
    const decoded = await decrypt(token);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    // Should be roughly 7 days from now (within 5 second tolerance)
    expect(decoded!.expiresAt).toBeGreaterThan(now + sevenDays - 5000);
    expect(decoded!.expiresAt).toBeLessThan(now + sevenDays + 5000);
  });
});
