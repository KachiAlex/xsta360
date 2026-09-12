"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySession, can, type AuthContext } from "@/lib/dal";
import { logEvent } from "@/lib/audit";
import { sendLeadAssignedEmail } from "@/lib/email";
import { createNotification } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const SourceSchema = z.enum([
  "referral",
  "social",
  "ad",
  "walk_in",
  "embedded_form",
  "contact_card_scan",
  "other",
]);

const CreateLeadSchema = z.object({
  name: z.string().min(1, "Name is required").trim(),
  company: z.string().trim().nullish(),
  email: z.string().trim().nullish(),
  phone: z.string().trim().nullish(),
  source: SourceSchema,
  campaign: z.string().trim().nullish(),
  notes: z.string().trim().nullish(),
  assigneeId: z.string().uuid().nullish().or(z.literal("")),
  stageId: z.string().uuid().nullish().or(z.literal("")),
  value: z.string().trim().nullish().or(z.literal("")),
  expectedCloseDate: z.string().trim().nullish().or(z.literal("")),
  customFields: z.string().trim().nullish().or(z.literal("")),
  forceCreate: z.string().nullish().or(z.literal("")),
  categoryIds: z.string().trim().nullish().or(z.literal("")),
});

const RemarkSchema = z.object({
  leadId: z.string().uuid(),
  body: z.string().min(1, "Remark cannot be empty").trim(),
  // Optional: set a follow-up reminder alongside the remark.
  reminderDue: z.string().nullish().or(z.literal("")),
});

const StageChangeSchema = z.object({
  leadId: z.string().uuid(),
  toStageId: z.string().uuid(),
  // Required when moving to a Lost stage.
  lostReasonId: z.string().uuid().nullish().or(z.literal("")),
  lostReasonText: z.string().trim().nullish(),
});

const SnoozeSchema = z.object({
  reminderId: z.string().uuid(),
  dueAt: z.string().min(1, "Pick a date"),
});

export type LeadFormState = {
  errors?: Record<string, string[]>;
  message?: string;
  ok?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load a lead and confirm it belongs to the caller's org. */
async function loadOrgLead(ctx: AuthContext, leadId: string) {
  const [lead] = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, ctx.orgId)))
    .limit(1);
  return lead ?? null;
}

async function loadOrgStage(ctx: AuthContext, stageId: string) {
  const [stage] = await db
    .select()
    .from(schema.pipelineStages)
    .where(
      and(
        eq(schema.pipelineStages.id, stageId),
        eq(schema.pipelineStages.orgId, ctx.orgId),
      ),
    )
    .limit(1);
  return stage ?? null;
}

// ---------------------------------------------------------------------------
// Create lead
// ---------------------------------------------------------------------------

export async function createLead(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const parsed = CreateLeadSchema.safeParse({
    name: formData.get("name"),
    company: formData.get("company"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    source: formData.get("source"),
    campaign: formData.get("campaign"),
    notes: formData.get("notes"),
    assigneeId: formData.get("assigneeId"),
    stageId: formData.get("stageId"),
    value: formData.get("value"),
    expectedCloseDate: formData.get("expectedCloseDate"),
    customFields: formData.get("customFields"),
    forceCreate: formData.get("forceCreate"),
    categoryIds: formData.get("categoryIds"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.issues.reduce<Record<string, string[]>>((acc, i) => {
        const key = i.path[0]?.toString() ?? "_";
        (acc[key] ??= []).push(i.message);
        return acc;
      }, {}),
    };
  }

  const { assigneeId, stageId, value, expectedCloseDate, customFields, forceCreate, categoryIds, ...rest } = parsed.data;

  // Duplicate detection — unless forceCreate is set.
  if (forceCreate !== "true" && (rest.email || rest.phone || rest.company)) {
    const { checkDuplicates } = await import("@/lib/duplicate");
    const dupes = await checkDuplicates(ctx.orgId, {
      email: rest.email || undefined,
      phone: rest.phone || undefined,
      name: rest.name,
      company: rest.company || undefined,
    });
    if (dupes.length > 0) {
      const dupeList = dupes.map((d) =>
        `${d.name}${d.company ? ` (${d.company})` : ""} — matched on ${d.matchField.replace("_", " + ")}`,
      ).join("; ");
      return {
        message: `Possible duplicate found: ${dupeList}. Submit again to create anyway.`,
        errors: { duplicate: ["true"] },
      };
    }
  }

  // Default to the first open stage if none provided.
  let stage = stageId ? await loadOrgStage(ctx, stageId) : null;
  if (!stage) {
    const [first] = await db
      .select()
      .from(schema.pipelineStages)
      .where(and(eq(schema.pipelineStages.orgId, ctx.orgId), eq(schema.pipelineStages.kind, "open")))
      .orderBy(schema.pipelineStages.position)
      .limit(1);
    stage = first ?? undefined;
  }

  // Parse custom fields JSON.
  let parsedCustomFields = {};
  if (customFields) {
    try {
      parsedCustomFields = JSON.parse(customFields);
    } catch {
      // ignore invalid JSON
    }
  }

  // Parse expected close date.
  let closeDate: Date | null = null;
  if (expectedCloseDate) {
    closeDate = new Date(expectedCloseDate);
    if (isNaN(closeDate.getTime())) closeDate = null;
  }

  // Validate assignee belongs to the org (prevent cross-tenant assignment).
  let finalAssigneeId = ctx.userId;
  if (assigneeId) {
    const { getOrgMembers } = await import("@/lib/queries");
    const members = await getOrgMembers(ctx.orgId);
    if (!members.some((m) => m.userId === assigneeId)) {
      return { message: "Assignee is not a member of this organization" };
    }
    finalAssigneeId = assigneeId;
  }

  // Sanitize numeric value (strip currency symbols, commas).
  const numericValue = (() => {
    if (!value) return null;
    const sanitized = value.replace(/[^\d.-]/g, "");
    const n = Number(sanitized);
    return sanitized && Number.isFinite(n) ? n.toFixed(2) : null;
  })();

  const [lead] = await db
    .insert(schema.leads)
    .values({
      ...rest,
      orgId: ctx.orgId,
      assigneeId: finalAssigneeId,
      stageId: stage?.id,
      createdById: ctx.userId,
      value: numericValue,
      expectedCloseDate: closeDate,
      customFields: parsedCustomFields,
    })
    .returning();

  await logEvent(ctx.orgId, "lead_created", {
    leadId: lead.id,
    actorId: ctx.userId,
    meta: { source: lead.source, stage: stage?.name, value: numericValue },
  });

  await notifyAssignee(ctx, lead);

  // Assign categories if provided (comma-separated UUIDs).
  if (categoryIds) {
    const ids = categoryIds.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) {
      const { enrollLeadInSequence } = await import("@/lib/sequences");
      const cats = await db
        .select()
        .from(schema.leadCategories)
        .where(
          and(
            eq(schema.leadCategories.orgId, ctx.orgId),
            inArray(schema.leadCategories.id, ids),
          ),
        );

      for (const cat of cats) {
        await db.insert(schema.leadCategoryAssignments).values({
          leadId: lead.id,
          categoryId: cat.id,
          orgId: ctx.orgId,
          assignedBy: ctx.userId,
        }).catch(() => {}); // ignore duplicate errors

        // Auto-enroll in linked sequence.
        if (cat.linkedSequenceId) {
          await enrollLeadInSequence(ctx.orgId, lead.id, cat.linkedSequenceId, ctx.userId).catch(() => {});
        }

        // Auto-assign rep.
        if (cat.defaultAssigneeId) {
          await db
            .update(schema.leads)
            .set({ assigneeId: cat.defaultAssigneeId, updatedAt: new Date() })
            .where(and(eq(schema.leads.id, lead.id), eq(schema.leads.orgId, ctx.orgId)));
        }

        // Auto-schedule follow-up.
        if (cat.followUpCadenceDays) {
          const dueAt = new Date(Date.now() + cat.followUpCadenceDays * 86_400_000);
          await db.insert(schema.reminders).values({
            leadId: lead.id,
            orgId: ctx.orgId,
            assigneeId: cat.defaultAssigneeId ?? lead.assigneeId,
            dueAt,
            note: `[Category: ${cat.name}] Follow-up scheduled by category cadence`,
            channel: "reminder",
          });
        }
      }
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Update lead
// ---------------------------------------------------------------------------

const UpdateLeadSchema = z.object({
  leadId: z.string().uuid(),
  name: z.string().min(1, "Name is required").trim(),
  company: z.string().trim().nullish(),
  email: z.string().trim().nullish(),
  phone: z.string().trim().nullish(),
  source: SourceSchema,
  campaign: z.string().trim().nullish(),
  notes: z.string().trim().nullish(),
  assigneeId: z.string().uuid().nullish().or(z.literal("")),
  stageId: z.string().uuid().nullish().or(z.literal("")),
  value: z.string().trim().nullish().or(z.literal("")),
  expectedCloseDate: z.string().trim().nullish().or(z.literal("")),
  customFields: z.string().trim().nullish().or(z.literal("")),
  lostReasonId: z.string().uuid().nullish().or(z.literal("")),
  lostReasonText: z.string().trim().nullish(),
});

export async function updateLead(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const parsed = UpdateLeadSchema.safeParse({
    leadId: formData.get("leadId"),
    name: formData.get("name"),
    company: formData.get("company"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    source: formData.get("source"),
    campaign: formData.get("campaign"),
    notes: formData.get("notes"),
    assigneeId: formData.get("assigneeId"),
    stageId: formData.get("stageId"),
    value: formData.get("value"),
    expectedCloseDate: formData.get("expectedCloseDate"),
    customFields: formData.get("customFields"),
    lostReasonId: formData.get("lostReasonId"),
    lostReasonText: formData.get("lostReasonText"),
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.issues.reduce<Record<string, string[]>>((acc, i) => {
        const key = i.path[0]?.toString() ?? "_";
        (acc[key] ??= []).push(i.message);
        return acc;
      }, {}),
    };
  }

  const { leadId, assigneeId, stageId, value, expectedCloseDate, customFields, lostReasonId, lostReasonText, ...rest } = parsed.data;

  // Verify lead belongs to org.
  const existing = await loadOrgLead(ctx, leadId);
  if (!existing) return { message: "Lead not found" };

  // Validate stage if provided.
  let newStageId = existing.stageId;
  let targetStageKind: string | null = null;
  if (stageId) {
    const stage = await loadOrgStage(ctx, stageId);
    if (!stage) return { message: "Stage not found" };
    newStageId = stage.id;
    targetStageKind = stage.kind;
  }

  // Validate assignee if provided.
  if (assigneeId) {
    const { getOrgMembers } = await import("@/lib/queries");
    const members = await getOrgMembers(ctx.orgId);
    if (!members.some((m) => m.userId === assigneeId)) {
      return { message: "Assignee is not a member of this organization" };
    }
  }

  // Parse custom fields JSON.
  let parsedCustomFields = existing.customFields ?? {};
  if (customFields) {
    try {
      parsedCustomFields = JSON.parse(customFields);
    } catch {
      // ignore invalid JSON, keep existing
    }
  }

  // Parse expected close date.
  let closeDate: Date | null = existing.expectedCloseDate ?? null;
  if (expectedCloseDate) {
    closeDate = new Date(expectedCloseDate);
    if (isNaN(closeDate.getTime())) closeDate = existing.expectedCloseDate ?? null;
  } else {
    closeDate = null;
  }

  const newAssigneeId = assigneeId || null;

  // Sanitize numeric value (strip currency symbols, commas).
  const numericValue = (() => {
    if (!value) return null;
    const sanitized = value.replace(/[^\d.-]/g, "");
    const n = Number(sanitized);
    return sanitized && Number.isFinite(n) ? n.toFixed(2) : null;
  })();

  // Handle lost-reason logic when stage changes.
  let lostReasonIdUpdate: string | null = null;
  let lostReasonTextUpdate: string | null = null;
  if (targetStageKind === "lost") {
    // Validate lostReasonId if provided.
    let reasonId = existing.lostReasonId;
    if (lostReasonId) {
      const [reason] = await db
        .select({ id: schema.lostReasons.id })
        .from(schema.lostReasons)
        .where(and(eq(schema.lostReasons.id, lostReasonId), eq(schema.lostReasons.orgId, ctx.orgId)))
        .limit(1);
      if (!reason) return { message: "Lost reason not found" };
      reasonId = reason.id;
    }
    if (!reasonId && !lostReasonText && !existing.lostReasonText) {
      return { errors: { lostReasonText: ["A reason is required when marking a lead lost"] } };
    }
    lostReasonIdUpdate = reasonId;
    lostReasonTextUpdate = lostReasonText || existing.lostReasonText;
  } else if (stageId && existing.stageId !== newStageId) {
    // Moving away from lost — clear reason.
    lostReasonIdUpdate = null;
    lostReasonTextUpdate = null;
  } else {
    lostReasonIdUpdate = existing.lostReasonId;
    lostReasonTextUpdate = existing.lostReasonText;
  }

  await db
    .update(schema.leads)
    .set({
      ...rest,
      assigneeId: newAssigneeId,
      stageId: newStageId,
      value: numericValue,
      expectedCloseDate: closeDate,
      customFields: parsedCustomFields,
      lostReasonId: lostReasonIdUpdate,
      lostReasonText: lostReasonTextUpdate,
      wonAt: targetStageKind === "won" ? new Date() : (stageId && existing.stageId !== newStageId ? null : undefined),
      lostAt: targetStageKind === "lost" ? new Date() : (stageId && existing.stageId !== newStageId ? null : undefined),
      updatedAt: new Date(),
    })
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, ctx.orgId)));

  if (newAssigneeId && newAssigneeId !== existing.assigneeId && newAssigneeId !== ctx.userId) {
    await notifyAssigneeById(ctx, leadId, rest.name, newAssigneeId);
  }

  await logEvent(ctx.orgId, "lead_updated", {
    leadId,
    actorId: ctx.userId,
    meta: { name: rest.name, source: rest.source, stageId: newStageId },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath("/reports");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Log remark (+ optional reminder)
// ---------------------------------------------------------------------------

export async function addRemark(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const parsed = RemarkSchema.safeParse({
    leadId: formData.get("leadId"),
    body: formData.get("body"),
    reminderDue: formData.get("reminderDue"),
  });
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.reduce<Record<string, string[]>>((acc, i) => {
        const key = i.path[0]?.toString() ?? "_";
        (acc[key] ??= []).push(i.message);
        return acc;
      }, {}),
    };
  }

  const { leadId, body, reminderDue } = parsed.data;
  const lead = await loadOrgLead(ctx, leadId);
  if (!lead) return { message: "Lead not found" };

  const [remark] = await db
    .insert(schema.remarks)
    .values({ leadId, orgId: ctx.orgId, authorId: ctx.userId, body })
    .returning();

  await logEvent(ctx.orgId, "remark_added", {
    leadId,
    actorId: ctx.userId,
    meta: { remarkId: remark.id },
  });

  // Optional reminder set from the remark modal.
  if (reminderDue) {
    const dueAt = new Date(reminderDue);
    if (!isNaN(dueAt.getTime())) {
      if (dueAt <= new Date()) {
        return { errors: { reminderDue: ["Pick a future date"] } };
      }
      const [reminder] = await db
        .insert(schema.reminders)
        .values({
          leadId,
          orgId: ctx.orgId,
          assigneeId: lead.assigneeId ?? ctx.userId,
          dueAt,
          note: body,
        })
        .returning();
      await logEvent(ctx.orgId, "reminder_set", {
        leadId,
        actorId: ctx.userId,
        meta: { reminderId: reminder.id, dueAt: dueAt.toISOString() },
      });
    }
  }

  revalidatePath("/dashboard");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Change stage (pipeline move + win/loss)
// ---------------------------------------------------------------------------

export async function changeStage(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const parsed = StageChangeSchema.safeParse({
    leadId: formData.get("leadId"),
    toStageId: formData.get("toStageId"),
    lostReasonId: formData.get("lostReasonId"),
    lostReasonText: formData.get("lostReasonText"),
  });
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.reduce<Record<string, string[]>>((acc, i) => {
        const key = i.path[0]?.toString() ?? "_";
        (acc[key] ??= []).push(i.message);
        return acc;
      }, {}),
    };
  }

  const { leadId, toStageId, lostReasonId, lostReasonText } = parsed.data;
  const lead = await loadOrgLead(ctx, leadId);
  if (!lead) return { message: "Lead not found" };

  const target = await loadOrgStage(ctx, toStageId);
  if (!target) return { message: "Stage not found" };

  // Lost requires a reason.
  if (target.kind === "lost" && !lostReasonId && !lostReasonText) {
    return { errors: { lostReasonText: ["A reason is required when marking a lead lost"] } };
  }

  // Validate lostReasonId exists and belongs to the org.
  let finalLostReasonId: string | null = null;
  let lostReasonLabel: string | null = null;
  if (target.kind === "lost" && lostReasonId) {
    const [reason] = await db
      .select({ id: schema.lostReasons.id, label: schema.lostReasons.label })
      .from(schema.lostReasons)
      .where(and(eq(schema.lostReasons.id, lostReasonId), eq(schema.lostReasons.orgId, ctx.orgId)))
      .limit(1);
    if (!reason) return { message: "Lost reason not found" };
    finalLostReasonId = reason.id;
    lostReasonLabel = reason.label;
  }

  await db
    .update(schema.leads)
    .set({
      stageId: target.id,
      updatedAt: new Date(),
      lostReasonId: target.kind === "lost" ? finalLostReasonId : null,
      lostReasonText: target.kind === "lost" ? (lostReasonText || null) : null,
      wonAt: target.kind === "won" ? new Date() : null,
      lostAt: target.kind === "lost" ? new Date() : null,
    })
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, ctx.orgId)))
    .returning();

  const eventType = target.kind === "won" ? "lead_won" : target.kind === "lost" ? "lead_lost" : "stage_changed";
  await logEvent(ctx.orgId, eventType, {
    leadId,
    actorId: ctx.userId,
    meta: {
      fromStageId: lead.stageId,
      toStageId: target.id,
      toStageName: target.name,
      lostReasonId: finalLostReasonId,
      lostReasonText: lostReasonText || null,
      lostReasonLabel,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/reports");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Snooze / complete reminder
// ---------------------------------------------------------------------------

export async function snoozeReminder(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const parsed = SnoozeSchema.safeParse({
    reminderId: formData.get("reminderId"),
    dueAt: formData.get("dueAt"),
  });
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.reduce<Record<string, string[]>>((acc, i) => {
        const key = i.path[0]?.toString() ?? "_";
        (acc[key] ??= []).push(i.message);
        return acc;
      }, {}),
    };
  }

  const dueAt = new Date(parsed.data.dueAt);
  if (isNaN(dueAt.getTime())) {
    return { errors: { dueAt: ["Invalid date"] } };
  }
  if (dueAt <= new Date()) {
    return { errors: { dueAt: ["Pick a future date"] } };
  }

  const [reminder] = await db
    .update(schema.reminders)
    .set({ status: "snoozed", dueAt, updatedAt: new Date() })
    .where(
      and(
        eq(schema.reminders.id, parsed.data.reminderId),
        eq(schema.reminders.orgId, ctx.orgId),
        inArray(schema.reminders.status, ["pending", "processing", "snoozed"]),
      ),
    )
    .returning();

  if (!reminder) return { message: "Reminder not found" };

  await logEvent(ctx.orgId, "reminder_snoozed", {
    leadId: reminder.leadId,
    actorId: ctx.userId,
    meta: { reminderId: reminder.id, dueAt: dueAt.toISOString() },
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function completeReminder(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const reminderId = String(formData.get("reminderId"));
  if (!z.string().uuid().safeParse(reminderId).success) return { message: "Invalid ID" };
  const [reminder] = await db
    .update(schema.reminders)
    .set({ status: "completed", updatedAt: new Date() })
    .where(
      and(
        eq(schema.reminders.id, reminderId),
        eq(schema.reminders.orgId, ctx.orgId),
        inArray(schema.reminders.status, ["pending", "processing", "snoozed"]),
      ),
    )
    .returning();

  if (!reminder) return { message: "Reminder not found" };

  await logEvent(ctx.orgId, "reminder_completed", {
    leadId: reminder.leadId,
    actorId: ctx.userId,
    meta: { reminderId: reminder.id },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/leads/${reminder.leadId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Export leads to CSV
// ---------------------------------------------------------------------------

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function exportLeads(): Promise<{ csv: string; filename: string } | { error: string }> {
  const ctx = await verifySession();
  if (!ctx) return { error: "Not signed in" };

  const { getLeads } = await import("@/lib/leads");
  const leads = await getLeads(ctx.orgId);

  const headers = [
    "ID",
    "Name",
    "Company",
    "Email",
    "Phone",
    "Source",
    "Campaign",
    "Stage",
    "Value",
    "Expected Close",
    "Assignee",
    "Score",
    "Created",
    "Updated",
  ];

  const rows = leads.map((l) => [
    l.id,
    l.name,
    l.company ?? "",
    l.email ?? "",
    l.phone ?? "",
    l.source,
    l.campaign ?? "",
    l.stageName ?? "",
    l.value ?? "",
    l.expectedCloseDate ? l.expectedCloseDate.toISOString().split("T")[0] : "",
    l.assigneeName ?? "Unassigned",
    String(l.score),
    l.createdAt.toISOString(),
    l.updatedAt.toISOString(),
  ]);

  const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
  const filename = `xsta360-leads-${new Date().toISOString().split("T")[0]}.csv`;
  return { csv, filename };
}

// ---------------------------------------------------------------------------
// Assign / reassign lead (admin/manager only)
// ---------------------------------------------------------------------------

export async function assignLead(
  _prev: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "assign")) return { message: "Not allowed" };

  const leadId = String(formData.get("leadId"));
  if (!z.string().uuid().safeParse(leadId).success) return { message: "Invalid ID" };
  const assigneeIdRaw = String(formData.get("assigneeId") || "");
  if (assigneeIdRaw && !z.string().uuid().safeParse(assigneeIdRaw).success) {
    return { message: "Invalid assignee ID" };
  }

  const lead = await loadOrgLead(ctx, leadId);
  if (!lead) return { message: "Lead not found" };

  // Validate assignee belongs to the org.
  const newAssigneeId = assigneeIdRaw || null;
  if (newAssigneeId) {
    const { getOrgMembers } = await import("@/lib/queries");
    const members = await getOrgMembers(ctx.orgId);
    if (!members.some((m) => m.userId === newAssigneeId)) {
      return { message: "Assignee is not a member of this organization" };
    }
  }

  await db
    .update(schema.leads)
    .set({ assigneeId: newAssigneeId, updatedAt: new Date() })
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, ctx.orgId)));

  if (newAssigneeId && newAssigneeId !== ctx.userId) {
    await notifyAssigneeById(ctx, leadId, lead.name, newAssigneeId);
  }

  await logEvent(ctx.orgId, "lead_assigned", {
    leadId,
    actorId: ctx.userId,
    meta: { fromAssigneeId: lead.assigneeId, toAssigneeId: newAssigneeId },
  });

  revalidatePath("/dashboard");
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/pipeline");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Assignment notifications
// ---------------------------------------------------------------------------

async function notifyAssignee(
  ctx: AuthContext,
  lead: { id: string; name: string; company: string | null; assigneeId: string | null },
) {
  if (!lead.assigneeId || lead.assigneeId === ctx.userId) return;

  const [user] = await db
    .select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, lead.assigneeId))
    .limit(1);

  if (!user?.email) return;

  await sendLeadAssignedEmail({
    to: user.email,
    userName: user.name,
    leadName: lead.name,
    leadCompany: lead.company,
    appUrl: process.env.APP_URL ?? "https://xsta360.com.ng",
  }).catch((e) => console.error("Lead assigned email failed:", e));

  await createNotification({
    orgId: ctx.orgId,
    userId: lead.assigneeId,
    type: "lead_assigned",
    title: "New lead assigned to you",
    body: `${lead.name}${lead.company ? ` — ${lead.company}` : ""}`,
    link: `/leads/${lead.id}`,
  }).catch((e) => console.error("Lead assigned notification failed:", e));
}

async function notifyAssigneeById(ctx: AuthContext, leadId: string, leadName: string, assigneeId: string) {
  const [lead] = await db
    .select({ company: schema.leads.company })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, ctx.orgId)))
    .limit(1);

  const [user] = await db
    .select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, assigneeId))
    .limit(1);

  if (!user?.email) return;

  await sendLeadAssignedEmail({
    to: user.email,
    userName: user.name,
    leadName,
    leadCompany: lead?.company,
    appUrl: process.env.APP_URL ?? "https://xsta360.com.ng",
  }).catch((e) => console.error("Lead assigned email failed:", e));

  await createNotification({
    orgId: ctx.orgId,
    userId: assigneeId,
    type: "lead_assigned",
    title: "New lead assigned to you",
    body: `${leadName}${lead?.company ? ` — ${lead.company}` : ""}`,
    link: `/leads`,
  }).catch((e) => console.error("Lead assigned notification failed:", e));
}

// ---------------------------------------------------------------------------
// Bulk actions
// ---------------------------------------------------------------------------

export type BulkFormState = {
  ok?: boolean;
  message?: string;
};

/** Bulk delete leads (admin/manager only). */
export async function bulkDeleteLeads(
  _prev: BulkFormState,
  formData: FormData,
): Promise<BulkFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "delete")) return { message: "Not allowed" };

  const leadIdsRaw = String(formData.get("leadIds") ?? "");
  const leadIds = leadIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (leadIds.length === 0) return { message: "No leads selected" };

  // Verify all leads belong to this org.
  const leads = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.orgId, ctx.orgId), inArray(schema.leads.id, leadIds)));
  const validIds = leads.map((l) => l.id);
  if (validIds.length === 0) return { message: "No valid leads found" };

  // Delete related records first.
  await db.delete(schema.leadCategoryAssignments).where(and(eq(schema.leadCategoryAssignments.orgId, ctx.orgId), inArray(schema.leadCategoryAssignments.leadId, validIds)));
  await db.delete(schema.reminders).where(and(eq(schema.reminders.orgId, ctx.orgId), inArray(schema.reminders.leadId, validIds)));
  await db.delete(schema.remarks).where(and(eq(schema.remarks.orgId, ctx.orgId), inArray(schema.remarks.leadId, validIds)));
  await db.delete(schema.sequenceEnrollments).where(and(eq(schema.sequenceEnrollments.orgId, ctx.orgId), inArray(schema.sequenceEnrollments.leadId, validIds)));
  await db.delete(schema.leadDocuments).where(and(eq(schema.leadDocuments.orgId, ctx.orgId), inArray(schema.leadDocuments.leadId, validIds)));
  await db.delete(schema.leads).where(and(eq(schema.leads.orgId, ctx.orgId), inArray(schema.leads.id, validIds)));

  for (const id of validIds) {
    await logEvent(ctx.orgId, "lead_deleted", { leadId: id, actorId: ctx.userId, meta: { action: "deleted" } });
  }

  revalidatePath("/dashboard");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  return { ok: true, message: `Deleted ${validIds.length} lead${validIds.length === 1 ? "" : "s"}` };
}

/** Bulk assign leads to a rep (admin/manager only). */
export async function bulkAssignLeads(
  _prev: BulkFormState,
  formData: FormData,
): Promise<BulkFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "assign")) return { message: "Not allowed" };

  const leadIdsRaw = String(formData.get("leadIds") ?? "");
  const leadIds = leadIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const assigneeId = String(formData.get("assigneeId") ?? "").trim() || null;
  if (leadIds.length === 0) return { message: "No leads selected" };

  // Validate assignee UUID + org membership.
  if (assigneeId) {
    if (!z.string().uuid().safeParse(assigneeId).success) return { message: "Invalid assignee ID" };
    const { getOrgMembers } = await import("@/lib/queries");
    const members = await getOrgMembers(ctx.orgId);
    if (!members.some((m) => m.userId === assigneeId)) {
      return { message: "Assignee is not a member of this organization" };
    }
  }

  // Verify all leads belong to this org.
  const leads = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.orgId, ctx.orgId), inArray(schema.leads.id, leadIds)));
  const validIds = leads.map((l) => l.id);
  if (validIds.length === 0) return { message: "No valid leads found" };

  await db
    .update(schema.leads)
    .set({ assigneeId, updatedAt: new Date() })
    .where(and(eq(schema.leads.orgId, ctx.orgId), inArray(schema.leads.id, validIds)));

  for (const id of validIds) {
    await logEvent(ctx.orgId, "lead_assigned", { leadId: id, actorId: ctx.userId, meta: { toAssigneeId: assigneeId } });
  }

  revalidatePath("/dashboard");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  return { ok: true, message: `Assigned ${validIds.length} lead${validIds.length === 1 ? "" : "s"}` };
}

/** Bulk move leads to a stage. */
export async function bulkMoveStage(
  _prev: BulkFormState,
  formData: FormData,
): Promise<BulkFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "assign")) return { message: "Not allowed" };

  const leadIdsRaw = String(formData.get("leadIds") ?? "");
  const leadIds = leadIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);
  const stageId = String(formData.get("stageId") ?? "").trim() || null;
  if (leadIds.length === 0) return { message: "No leads selected" };
  if (!stageId) return { message: "No stage selected" };
  if (!z.string().uuid().safeParse(stageId).success) return { message: "Invalid stage ID" };

  // Verify stage belongs to org.
  const [stage] = await db
    .select()
    .from(schema.pipelineStages)
    .where(and(eq(schema.pipelineStages.id, stageId), eq(schema.pipelineStages.orgId, ctx.orgId)))
    .limit(1);
  if (!stage) return { message: "Stage not found" };

  const lostReasonId = String(formData.get("lostReasonId") ?? "").trim() || null;
  const lostReasonText = String(formData.get("lostReasonText") ?? "").trim() || null;
  if (stage.kind === "lost" && !lostReasonId && !lostReasonText) {
    return { message: "A reason is required when moving leads to a lost stage" };
  }

  // Verify leads belong to org.
  const leads = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.orgId, ctx.orgId), inArray(schema.leads.id, leadIds)));
  const validIds = leads.map((l) => l.id);
  if (validIds.length === 0) return { message: "No valid leads found" };

  await db
    .update(schema.leads)
    .set({
      stageId,
      updatedAt: new Date(),
      lostReasonId: stage.kind === "lost" ? (lostReasonId || null) : null,
      lostReasonText: stage.kind === "lost" ? (lostReasonText || null) : null,
      wonAt: stage.kind === "won" ? new Date() : null,
      lostAt: stage.kind === "lost" ? new Date() : null,
    })
    .where(and(eq(schema.leads.orgId, ctx.orgId), inArray(schema.leads.id, validIds)));

  const eventType = stage.kind === "won" ? "lead_won" : stage.kind === "lost" ? "lead_lost" : "stage_changed";
  for (const id of validIds) {
    await logEvent(ctx.orgId, eventType, { leadId: id, actorId: ctx.userId, meta: { toStage: stage.name } });
  }

  revalidatePath("/dashboard");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  return { ok: true, message: `Moved ${validIds.length} lead${validIds.length === 1 ? "" : "s"} to ${stage.name}` };
}
