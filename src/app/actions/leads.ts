"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySession, can, type AuthContext } from "@/lib/dal";
import { logEvent } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const SourceSchema = z.enum([
  "referral",
  "social",
  "ad",
  "walk_in",
  "embedded_form",
  "other",
]);

const CreateLeadSchema = z.object({
  name: z.string().min(1, "Name is required").trim(),
  company: z.string().trim().optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  source: SourceSchema,
  campaign: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  assigneeId: z.string().uuid().optional().or(z.literal("")),
  stageId: z.string().uuid().optional().or(z.literal("")),
  value: z.string().trim().optional().or(z.literal("")),
  expectedCloseDate: z.string().trim().optional().or(z.literal("")),
  customFields: z.string().trim().optional().or(z.literal("")),
  forceCreate: z.string().optional().or(z.literal("")),
});

const RemarkSchema = z.object({
  leadId: z.string().uuid(),
  body: z.string().min(1, "Remark cannot be empty").trim(),
  // Optional: set a follow-up reminder alongside the remark.
  reminderDue: z.string().optional().or(z.literal("")),
});

const StageChangeSchema = z.object({
  leadId: z.string().uuid(),
  toStageId: z.string().uuid(),
  // Required when moving to a Lost stage.
  lostReasonId: z.string().uuid().optional().or(z.literal("")),
  lostReasonText: z.string().trim().optional(),
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

  const { assigneeId, stageId, value, expectedCloseDate, customFields, forceCreate, ...rest } = parsed.data;

  // Duplicate detection — unless forceCreate is set.
  if (forceCreate !== "true" && (rest.email || rest.phone || rest.company)) {
    const { checkDuplicates } = await import("@/lib/duplicate");
    const dupes = await checkDuplicates(ctx.orgId, {
      email: rest.email,
      phone: rest.phone,
      name: rest.name,
      company: rest.company,
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

  const [lead] = await db
    .insert(schema.leads)
    .values({
      ...rest,
      orgId: ctx.orgId,
      assigneeId: assigneeId || ctx.userId,
      stageId: stage?.id,
      createdById: ctx.userId,
      value: value || null,
      expectedCloseDate: closeDate,
      customFields: parsedCustomFields,
    })
    .returning();

  await logEvent(ctx.orgId, "lead_created", {
    leadId: lead.id,
    actorId: ctx.userId,
    meta: { source: lead.source, stage: stage?.name, value: value || null },
  });

  revalidatePath("/dashboard");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
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

  await db
    .update(schema.leads)
    .set({
      stageId: target.id,
      updatedAt: new Date(),
      lostReasonId: target.kind === "lost" ? (lostReasonId || null) : null,
      lostReasonText: target.kind === "lost" ? (lostReasonText || null) : null,
    })
    .where(eq(schema.leads.id, leadId))
    .returning();

  const eventType = target.kind === "won" ? "lead_won" : target.kind === "lost" ? "lead_lost" : "stage_changed";
  await logEvent(ctx.orgId, eventType, {
    leadId,
    actorId: ctx.userId,
    meta: {
      fromStageId: lead.stageId,
      toStageId: target.id,
      toStageName: target.name,
      lostReasonId: lostReasonId || null,
      lostReasonText: lostReasonText || null,
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

  const [reminder] = await db
    .update(schema.reminders)
    .set({ status: "snoozed", dueAt, updatedAt: new Date() })
    .where(
      and(
        eq(schema.reminders.id, parsed.data.reminderId),
        eq(schema.reminders.orgId, ctx.orgId),
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
  const [reminder] = await db
    .update(schema.reminders)
    .set({ status: "completed", updatedAt: new Date() })
    .where(
      and(
        eq(schema.reminders.id, reminderId),
        eq(schema.reminders.orgId, ctx.orgId),
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
  const assigneeId = String(formData.get("assigneeId") || "");

  const lead = await loadOrgLead(ctx, leadId);
  if (!lead) return { message: "Lead not found" };

  await db
    .update(schema.leads)
    .set({ assigneeId: assigneeId || null, updatedAt: new Date() })
    .where(eq(schema.leads.id, leadId));

  await logEvent(ctx.orgId, "lead_assigned", {
    leadId,
    actorId: ctx.userId,
    meta: { fromAssigneeId: lead.assigneeId, toAssigneeId: assigneeId || null },
  });

  revalidatePath("/dashboard");
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/pipeline");
  return { ok: true };
}
