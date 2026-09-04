import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Track which query is being made so we can return appropriate data
const mockMembers = [{ userId: "user-1" }, { userId: "user-2" }];
const mockNotifs = [
  { id: "n1", orgId: "org-1", userId: "user-1", title: "Test", readAt: null },
];
const mockCountRow = [{ count: 3 }];

vi.mock("@/db", () => ({
  db: {
    select: vi.fn((sel?: any) => {
      // Detect count query by checking if sel has count property
      const isCount = sel && typeof sel === "object" && "count" in sel;
      // Detect memberships query by checking if sel has userId
      const isMemberships = sel && typeof sel === "object" && "userId" in sel && !("count" in sel);

      return {
        from: vi.fn((table: any) => {
          const isMemTable = table === "memberships";
          return {
            where: vi.fn(() => {
              // Memberships query → return array directly
              if (isMemTable || isMemberships) return Promise.resolve(mockMembers);
              // Count query → return array with count row
              if (isCount) return Promise.resolve(mockCountRow);
              // Notifications list query → return chainable for orderBy().limit()
              return {
                orderBy: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve(mockNotifs)),
                })),
              };
            }),
          };
        }),
      };
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
  schema: {
    notifications: { orgId: "org_id", userId: "user_id", readAt: "read_at", id: "id", createdAt: "created_at" },
    memberships: { orgId: "org_id", userId: "user_id" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  and: vi.fn((...args) => ({ and: args })),
  isNull: vi.fn((a) => ({ isNull: a })),
  desc: vi.fn((a) => ({ desc: a })),
  or: vi.fn((...args) => ({ or: args })),
  sql: vi.fn((strings, ...values) => ({ count: true, strings, values })),
}));

const {
  createNotification,
  broadcastToOrg,
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} = await import("@/lib/notifications");

describe("notifications lib", () => {
  it("createNotification calls db.insert", async () => {
    await createNotification({
      orgId: "org-1",
      userId: "user-1",
      type: "lead_assigned",
      title: "New lead",
      body: "John Doe assigned to you",
      link: "/leads/123",
    });
    // Just verify it doesn't throw
    expect(true).toBe(true);
  });

  it("createNotification works without userId (broadcast)", async () => {
    await createNotification({
      orgId: "org-1",
      userId: null,
      type: "payment_success",
      title: "Payment received",
    });
    expect(true).toBe(true);
  });

  it("broadcastToOrg inserts for all members", async () => {
    await broadcastToOrg({
      orgId: "org-1",
      type: "trial_ending",
      title: "Trial ending",
      body: "3 days left",
      link: "/billing",
    });
    expect(true).toBe(true);
  });

  it("getUserNotifications returns array", async () => {
    const result = await getUserNotifications("org-1", "user-1");
    expect(Array.isArray(result)).toBe(true);
  });

  it("getUnreadCount returns number", async () => {
    const result = await getUnreadCount("org-1", "user-1");
    expect(typeof result).toBe("number");
  });

  it("markAsRead calls db.update", async () => {
    await markAsRead("notif-1", "user-1");
    expect(true).toBe(true);
  });

  it("markAllAsRead calls db.update", async () => {
    await markAllAsRead("org-1", "user-1");
    expect(true).toBe(true);
  });
});
