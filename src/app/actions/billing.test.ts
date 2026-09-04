import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock server-only
vi.mock("server-only", () => ({}));

// Mock next/headers
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ get: () => undefined, set: () => {}, delete: () => {} })),
}));

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock the DB
const mockDb = {
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn(() => Promise.resolve([])),
      })),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
  })),
  insert: vi.fn(() => ({
    values: vi.fn(() => Promise.resolve()),
  })),
};

vi.mock("@/db", () => ({
  db: mockDb,
  schema: {
    plans: { id: "id", active: "active" },
    subscriptions: { id: "id", orgId: "org_id", planId: "plan_id" },
    notifications: { id: "id", orgId: "org_id", userId: "user_id", readAt: "read_at" },
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ a, b })),
  and: vi.fn((...args) => args),
  isNull: vi.fn((a) => ({ isNull: a })),
  desc: vi.fn((a) => ({ desc: a })),
  asc: vi.fn((a) => ({ asc: a })),
  or: vi.fn((...args) => ({ or: args })),
  sql: vi.fn((strings, ...values) => ({ strings, values })),
}));

// Mock DAL
vi.mock("@/lib/dal", () => ({
  verifySession: vi.fn(() => Promise.resolve(null)),
  getOrgBilling: vi.fn(() => Promise.resolve({
    monthlyAmount: 1500,
    memberCount: 1,
    plan: { planId: "plan-1", planName: "Starter", currency: "₦" },
  })),
}));

// Mock audit
vi.mock("@/lib/audit", () => ({
  logEvent: vi.fn(() => Promise.resolve()),
}));

// Mock paystack
vi.mock("@/lib/paystack", () => ({
  chargeAuthorization: vi.fn(() => Promise.resolve({ status: "success" })),
  nairaToKobo: vi.fn((n) => n * 100),
  generateReference: vi.fn(() => "test_ref_123"),
}));

// Mock notifications
vi.mock("@/lib/notifications", () => ({
  createNotification: vi.fn(() => Promise.resolve()),
  broadcastToOrg: vi.fn(() => Promise.resolve()),
  getUserNotifications: vi.fn(() => Promise.resolve([])),
  getUnreadCount: vi.fn(() => Promise.resolve(0)),
  markAsRead: vi.fn(() => Promise.resolve()),
  markAllAsRead: vi.fn(() => Promise.resolve()),
}));

const { changePlan } = await import("@/app/actions/billing");
const { verifySession } = await import("@/lib/dal");

describe("changePlan action", () => {
  it("returns error when not signed in", async () => {
    vi.mocked(verifySession).mockResolvedValueOnce(null);
    const formData = new FormData();
    formData.set("planId", "550e8400-e29b-41d4-a716-446655440000");
    const result = await changePlan({}, formData);
    expect(result.message).toBe("Not signed in");
    expect(result.error).toBe(true);
  });

  it("returns error for non-admin user", async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      session: { userId: "u1", orgId: "o1", role: "rep", isSuperadmin: false, tokenVersion: 0, expiresAt: 0 },
      userId: "u1",
      orgId: "o1",
      role: "rep",
      isSuperadmin: false,
    } as any);
    const formData = new FormData();
    formData.set("planId", "550e8400-e29b-41d4-a716-446655440000");
    const result = await changePlan({}, formData);
    expect(result.message).toContain("admin");
    expect(result.error).toBe(true);
  });

  it("returns error for invalid plan ID (not UUID)", async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      session: { userId: "u1", orgId: "o1", role: "admin", isSuperadmin: false, tokenVersion: 0, expiresAt: 0 },
      userId: "u1",
      orgId: "o1",
      role: "admin",
      isSuperadmin: false,
    } as any);
    const formData = new FormData();
    formData.set("planId", "not-a-uuid");
    const result = await changePlan({}, formData);
    expect(result.message).toBe("Invalid plan");
    expect(result.error).toBe(true);
  });

  it("returns error for missing plan ID", async () => {
    vi.mocked(verifySession).mockResolvedValueOnce({
      session: { userId: "u1", orgId: "o1", role: "admin", isSuperadmin: false, tokenVersion: 0, expiresAt: 0 },
      userId: "u1",
      orgId: "o1",
      role: "admin",
      isSuperadmin: false,
    } as any);
    const formData = new FormData();
    const result = await changePlan({}, formData);
    expect(result.message).toBe("Invalid plan");
    expect(result.error).toBe(true);
  });
});
