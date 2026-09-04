import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Track call count to differentiate sequence lookup vs enrollment lookup
let selectCallCount = 0;

const mockDb = {
  select: vi.fn(() => {
    selectCallCount++;
    const callNum = selectCallCount;
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          // First call: sequence lookup → return sequence
          // Second call: existing enrollment check → return empty (not enrolled)
          limit: vi.fn(() =>
            Promise.resolve(callNum === 1 ? [{ id: "seq-1", orgId: "org-1", active: true }] : []),
          ),
        })),
      })),
    };
  }),
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(() => Promise.resolve([{ id: "enr-1" }])),
    })),
  })),
};

vi.mock("@/db", () => ({
  db: mockDb,
  schema: {
    sequences: { id: "id", orgId: "org_id", active: "active" },
    sequenceEnrollments: { sequenceId: "seq_id", leadId: "lead_id", status: "status", orgId: "org_id" },
    sequenceSteps: { sequenceId: "seq_id", position: "position" },
    leads: { id: "id" },
    organizations: { id: "id" },
    reminders: { leadId: "lead_id", orgId: "org_id" },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  and: vi.fn((...args) => ({ and: args })),
  asc: vi.fn((a) => ({ asc: a })),
}));

vi.mock("@/lib/audit", () => ({
  logEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppMessage: vi.fn(() => Promise.resolve({ success: true })),
  formatWhatsAppMessage: vi.fn((body, org) => `${body}\n\n— ${org}`),
}));

vi.mock("@/lib/email", () => ({
  sendMail: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/message-format", () => ({
  replacePlaceholders: vi.fn((text) => text),
  buildEmailHtml: vi.fn((body, org) => `<div>${body}</div>`),
  formatWhatsAppMessage: vi.fn((body, org) => `${body}\n\n— ${org}`),
}));

const { enrollLeadInSequence } = await import("@/lib/sequences");

describe("enrollLeadInSequence", () => {
  it("returns ok: true for valid enrollment", async () => {
    selectCallCount = 0; // reset
    const result = await enrollLeadInSequence("org-1", "lead-1", "seq-1", "user-1");
    expect(result.ok).toBe(true);
  });

  it("returns error for non-existent sequence", async () => {
    selectCallCount = 0;
    // Override: first select returns empty (no sequence found)
    const originalSelect = mockDb.select;
    mockDb.select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    }));
    const result = await enrollLeadInSequence("org-1", "lead-1", "nonexistent", "user-1");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Sequence not found");
    mockDb.select = originalSelect;
  });

  it("returns error for inactive sequence", async () => {
    selectCallCount = 0;
    mockDb.select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{ id: "seq-1", orgId: "org-1", active: false }])),
        })),
      })),
    }));
    const result = await enrollLeadInSequence("org-1", "lead-1", "seq-1", "user-1");
    expect(result.ok).toBe(false);
    expect(result.message).toBe("Sequence is not active");
  });
});
