import { describe, it, expect, vi } from "vitest";
import { hashApiKey, generateApiKey, generateWebhookSecret } from "@/lib/api";
import { validateWebhookUrl } from "@/lib/outbound-webhooks";

// crypto/db-free pure checks — hashing, key format, URL validation.
vi.mock("@/db", () => ({ db: {}, schema: {} }));
vi.mock("server-only", () => ({}));

describe("api keys", () => {
  it("generateApiKey produces xsta_live_ keys with stable hash + prefix", () => {
    const a = generateApiKey();
    expect(a.key).toMatch(/^xsta_live_[0-9a-f]{48}$/);
    expect(a.prefix).toBe(a.key.slice(0, 17));
    expect(a.keyHash).toBe(hashApiKey(a.key));
    expect(generateApiKey().key).not.toBe(a.key);
  });

  it("hashApiKey is deterministic sha256", () => {
    expect(hashApiKey("xsta_live_test")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKey("xsta_live_test")).toBe(hashApiKey("xsta_live_test"));
  });

  it("generateWebhookSecret produces whsec_ secrets", () => {
    const s = generateWebhookSecret();
    expect(s).toMatch(/^whsec_[0-9a-f]{48}$/);
    expect(s).not.toBe(generateWebhookSecret());
  });
});

describe("validateWebhookUrl", () => {
  it("accepts public https URLs", () => {
    expect(validateWebhookUrl("https://store.example.com/hook").ok).toBe(true);
  });

  it("rejects non-https and missing URLs", () => {
    expect(validateWebhookUrl("http://example.com/hook").ok).toBe(false);
    expect(validateWebhookUrl("not-a-url").ok).toBe(false);
    expect(validateWebhookUrl("").ok).toBe(false);
    expect(validateWebhookUrl("ftp://example.com").ok).toBe(false);
  });

  it("rejects private/internal hosts (SSRF)", () => {
    for (const url of [
      "https://localhost/hook",
      "https://127.0.0.1/hook",
      "https://10.0.0.5/hook",
      "https://192.168.1.10/hook",
      "https://172.16.0.1/hook",
      "https://172.31.255.1/hook",
      "https://169.254.169.254/latest/meta-data",
      "https://svc.internal/hook",
      "https://nas.local/hook",
    ]) {
      expect(validateWebhookUrl(url).ok).toBe(false);
    }
    // Public 172.x must not be blocked — only 172.16-31 is private.
    expect(validateWebhookUrl("https://172.32.0.1/hook").ok).toBe(true);
  });
});
