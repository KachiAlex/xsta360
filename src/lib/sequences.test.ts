import { describe, it, expect, vi, beforeEach } from "vitest";

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

const sendMailMock = vi.fn(() => Promise.resolve());
vi.mock("@/lib/email", () => ({
  sendMail: sendMailMock,
}));

vi.mock("@/lib/message-format", () => ({
  replacePlaceholders: vi.fn((text) => text),
  buildEmailHtml: vi.fn((body, org) => `<div>${body}</div>`),
  buildEmailHtmlFromRich: vi.fn((body, org) => `<div>${body}</div>`),
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

// ---------------------------------------------------------------------------
// processSequenceSteps — email step processing
// ---------------------------------------------------------------------------

describe("processSequenceSteps — email flow", () => {
  // Helper: build a mock db that returns controlled data for each select call.
  // The order of select calls in processSequenceSteps is:
  //   1. enrollments (where status=active) — no limit, iterated directly
  //   2. steps (where sequenceId=..., orderBy position) — no limit
  //   3. lead (where id=leadId, limit 1)
  //   4. org (where id=orgId, limit 1)
  //   5. rep (where id=assigneeId, limit 1) — only if lead.assigneeId is set
  //   6. documents (where orgId + inArray attachmentIds) — only if attachments
  function buildMockDb(opts: {
    enrollments: any[];
    steps: any[];
    lead: any | null;
    org?: any;
    rep?: any;
    documents?: any[];
  }) {
    let callIdx = 0;
    const selectReturns = [
      opts.enrollments, // enrollments
      opts.steps, // steps
      opts.lead ? [opts.lead] : [], // lead
      opts.org ? [opts.org] : [], // org
      opts.rep ? [opts.rep] : [], // rep (if assigneeId)
      opts.documents ?? [], // documents (if attachments)
    ];

    // Create a thenable that resolves to `data` but also has .limit() and .orderBy()
    function makeThenable(data: any[]) {
      const thenable = {
        then: (resolve: any, reject?: any) => Promise.resolve(data).then(resolve, reject),
        limit: () => makeThenable(data),
        orderBy: () => makeThenable(data),
      };
      return thenable;
    }

    return {
      select: vi.fn(() => {
        const idx = callIdx++;
        const data = selectReturns[idx] ?? [];
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => makeThenable(data)),
          })),
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
    };
  }

  // Reset mocks between tests
  beforeEach(() => {
    sendMailMock.mockClear();
  });

  it("sends an email for an email step with senderName and replyTo", async () => {
    const mockDbEmail = buildMockDb({
      enrollments: [
        {
          id: "enr-1",
          sequenceId: "seq-1",
          leadId: "lead-1",
          orgId: "org-1",
          currentStep: 0,
          enrolledAt: new Date(Date.now() - 86_400_000), // 1 day ago
          enrolledBy: "user-1",
        },
      ],
      steps: [
        {
          id: "step-1",
          sequenceId: "seq-1",
          position: 0,
          delayDays: 0,
          action: "email",
          subject: "Welcome {{first_name}}",
          body: "<p>Hi {{first_name}}, welcome to {{org_name}}!</p>",
          senderName: "Tunde from Kreatix",
          attachments: [],
        },
      ],
      lead: {
        id: "lead-1",
        name: "Adaeze Okonkwo",
        email: "adaeze@example.com",
        phone: "+2348000000000",
        company: "Acme Corp",
        assigneeId: "user-2",
      },
      org: {
        name: "Kreatix",
        whatsappConfig: null,
        replyToEmail: "replies@kreatix.com",
      },
      rep: { name: "Tunde Bakare" },
    });

    // Re-mock @/db with our email-specific mock
    vi.doMock("@/db", () => ({
      db: mockDbEmail,
      schema: {
        sequences: { id: "id", orgId: "org_id", active: "active" },
        sequenceEnrollments: { id: "id", sequenceId: "seq_id", leadId: "lead_id", status: "status", orgId: "org_id" },
        sequenceSteps: { sequenceId: "seq_id", position: "position" },
        leads: { id: "id" },
        organizations: { id: "id", name: "name", whatsappConfig: "whatsapp_config", replyToEmail: "reply_to_email" },
        users: { id: "id", name: "name" },
        reminders: {},
        documents: { id: "id", orgId: "org_id", fileName: "file_name", r2Key: "r2_key", publicUrl: "public_url", mimeType: "mime_type" },
      },
    }));

    // Re-mock drizzle-orm with inArray support
    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn((a, b) => ({ eq: [a, b] })),
      and: vi.fn((...args) => ({ and: args })),
      asc: vi.fn((a) => ({ asc: a })),
      inArray: vi.fn((a, b) => ({ inArray: [a, b] })),
    }));

    // Re-mock r2
    vi.doMock("@/lib/r2", () => ({
      getDownloadUrl: vi.fn(() => Promise.resolve("https://r2.example.com/file.pdf")),
    }));

    // Need to re-import after doMock
    vi.resetModules();
    const { processSequenceSteps } = await import("@/lib/sequences");

    const result = await processSequenceSteps();

    expect(result.processed).toBe(1);
    expect(result.emailsSent).toBe(1);
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    // Check the email was sent with the right parameters
    const callArgs = sendMailMock.mock.calls[0];
    expect(callArgs[0]).toBe("adaeze@example.com"); // to
    expect(callArgs[1]).toContain("Welcome"); // subject
    expect(callArgs[2]).toContain("<p>Hi"); // html body

    // Check options: senderName and replyTo
    const options = callArgs[3];
    expect(options.senderName).toBe("Tunde from Kreatix");
    expect(options.replyTo).toBe("replies@kreatix.com");
  });

  it("skips email if lead has no email address", async () => {
    const mockDbNoEmail = buildMockDb({
      enrollments: [
        {
          id: "enr-2",
          sequenceId: "seq-2",
          leadId: "lead-2",
          orgId: "org-1",
          currentStep: 0,
          enrolledAt: new Date(Date.now() - 86_400_000),
          enrolledBy: "user-1",
        },
      ],
      steps: [
        {
          id: "step-2",
          sequenceId: "seq-2",
          position: 0,
          delayDays: 0,
          action: "email",
          subject: "Hello",
          body: "Hi there",
          senderName: null,
          attachments: [],
        },
      ],
      lead: {
        id: "lead-2",
        name: "John Doe",
        email: null, // no email
        phone: "+2348000000000",
        company: null,
        assigneeId: null,
      },
      org: {
        name: "Kreatix",
        whatsappConfig: null,
        replyToEmail: null,
      },
    });

    vi.doMock("@/db", () => ({
      db: mockDbNoEmail,
      schema: {
        sequences: { id: "id", orgId: "org_id", active: "active" },
        sequenceEnrollments: { id: "id", sequenceId: "seq_id", leadId: "lead_id", status: "status", orgId: "org_id" },
        sequenceSteps: { sequenceId: "seq_id", position: "position" },
        leads: { id: "id" },
        organizations: { id: "id", name: "name", whatsappConfig: "whatsapp_config", replyToEmail: "reply_to_email" },
        users: { id: "id", name: "name" },
        reminders: {},
        documents: { id: "id", orgId: "org_id" },
      },
    }));

    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn((a, b) => ({ eq: [a, b] })),
      and: vi.fn((...args) => ({ and: args })),
      asc: vi.fn((a) => ({ asc: a })),
      inArray: vi.fn((a, b) => ({ inArray: [a, b] })),
    }));

    vi.doMock("@/lib/r2", () => ({
      getDownloadUrl: vi.fn(() => Promise.resolve("https://r2.example.com/file.pdf")),
    }));

    vi.resetModules();
    const { processSequenceSteps } = await import("@/lib/sequences");

    const result = await processSequenceSteps();

    expect(result.processed).toBe(1);
    expect(result.emailsSent).toBe(0); // no email sent
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("defaults senderName to org name when not set", async () => {
    const mockDbDefaultSender = buildMockDb({
      enrollments: [
        {
          id: "enr-3",
          sequenceId: "seq-3",
          leadId: "lead-3",
          orgId: "org-1",
          currentStep: 0,
          enrolledAt: new Date(Date.now() - 86_400_000),
          enrolledBy: "user-1",
        },
      ],
      steps: [
        {
          id: "step-3",
          sequenceId: "seq-3",
          position: 0,
          delayDays: 0,
          action: "email",
          subject: "Test",
          body: "<p>Hello</p>",
          senderName: null, // not set
          attachments: [],
        },
      ],
      lead: {
        id: "lead-3",
        name: "Jane Smith",
        email: "jane@example.com",
        phone: null,
        company: null,
        assigneeId: null,
      },
      org: {
        name: "My Org",
        whatsappConfig: null,
        replyToEmail: null,
      },
    });

    vi.doMock("@/db", () => ({
      db: mockDbDefaultSender,
      schema: {
        sequences: { id: "id", orgId: "org_id", active: "active" },
        sequenceEnrollments: { id: "id", sequenceId: "seq_id", leadId: "lead_id", status: "status", orgId: "org_id" },
        sequenceSteps: { sequenceId: "seq_id", position: "position" },
        leads: { id: "id" },
        organizations: { id: "id", name: "name", whatsappConfig: "whatsapp_config", replyToEmail: "reply_to_email" },
        users: { id: "id", name: "name" },
        reminders: {},
        documents: { id: "id", orgId: "org_id" },
      },
    }));

    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn((a, b) => ({ eq: [a, b] })),
      and: vi.fn((...args) => ({ and: args })),
      asc: vi.fn((a) => ({ asc: a })),
      inArray: vi.fn((a, b) => ({ inArray: [a, b] })),
    }));

    vi.doMock("@/lib/r2", () => ({
      getDownloadUrl: vi.fn(() => Promise.resolve("https://r2.example.com/file.pdf")),
    }));

    vi.resetModules();
    const { processSequenceSteps } = await import("@/lib/sequences");

    await processSequenceSteps();

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const options = sendMailMock.mock.calls[0][3];
    expect(options.senderName).toBe("My Org"); // defaults to org name
  });

  it("detects HTML body from rich text editor and uses buildEmailHtmlFromRich", async () => {
    const { buildEmailHtml, buildEmailHtmlFromRich } = await import("@/lib/message-format");
    const buildEmailHtmlSpy = vi.mocked(buildEmailHtml);
    const buildEmailHtmlFromRichSpy = vi.mocked(buildEmailHtmlFromRich);

    buildEmailHtmlSpy.mockClear();
    buildEmailHtmlFromRichSpy.mockClear();

    const mockDbHtml = buildMockDb({
      enrollments: [
        {
          id: "enr-4",
          sequenceId: "seq-4",
          leadId: "lead-4",
          orgId: "org-1",
          currentStep: 0,
          enrolledAt: new Date(Date.now() - 86_400_000),
          enrolledBy: "user-1",
        },
      ],
      steps: [
        {
          id: "step-4",
          sequenceId: "seq-4",
          position: 0,
          delayDays: 0,
          action: "email",
          subject: "Rich test",
          body: "<strong>Bold</strong> and <em>italic</em> text",
          senderName: null,
          attachments: [],
        },
      ],
      lead: {
        id: "lead-4",
        name: "Test User",
        email: "test@example.com",
        phone: null,
        company: null,
        assigneeId: null,
      },
      org: {
        name: "Test Org",
        whatsappConfig: null,
        replyToEmail: null,
      },
    });

    vi.doMock("@/db", () => ({
      db: mockDbHtml,
      schema: {
        sequences: { id: "id", orgId: "org_id", active: "active" },
        sequenceEnrollments: { id: "id", sequenceId: "seq_id", leadId: "lead_id", status: "status", orgId: "org_id" },
        sequenceSteps: { sequenceId: "seq_id", position: "position" },
        leads: { id: "id" },
        organizations: { id: "id", name: "name", whatsappConfig: "whatsapp_config", replyToEmail: "reply_to_email" },
        users: { id: "id", name: "name" },
        reminders: {},
        documents: { id: "id", orgId: "org_id" },
      },
    }));

    vi.doMock("drizzle-orm", () => ({
      eq: vi.fn((a, b) => ({ eq: [a, b] })),
      and: vi.fn((...args) => ({ and: args })),
      asc: vi.fn((a) => ({ asc: a })),
      inArray: vi.fn((a, b) => ({ inArray: [a, b] })),
    }));

    vi.doMock("@/lib/r2", () => ({
      getDownloadUrl: vi.fn(() => Promise.resolve("https://r2.example.com/file.pdf")),
    }));

    vi.resetModules();
    const { processSequenceSteps } = await import("@/lib/sequences");

    await processSequenceSteps();

    // HTML body should use buildEmailHtmlFromRich, not buildEmailHtml
    expect(buildEmailHtmlFromRichSpy).toHaveBeenCalled();
    expect(buildEmailHtmlSpy).not.toHaveBeenCalled();
  });
});

