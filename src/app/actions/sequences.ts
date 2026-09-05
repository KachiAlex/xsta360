"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySession, getOrgPlan, planHasFeature } from "@/lib/dal";

/** Returns an error state if the org's plan doesn't include sequences. */
async function requireSequences(orgId: string): Promise<{ message: string } | null> {
  const plan = await getOrgPlan(orgId);
  if (!planHasFeature(plan, "sequences")) {
    return { message: `Sequences aren't included on the ${plan.planName} plan. Upgrade to use them.` };
  }
  return null;
}
import { logEvent } from "@/lib/audit";
import { enrollLeadInSequence } from "@/lib/sequences";

export type SequenceFormState = {
  errors?: Record<string, string[]>;
  message?: string;
  ok?: boolean;
};

const CreateSequenceSchema = z.object({
  name: z.string().min(1, "Name is required").trim(),
  description: z.string().trim().optional().or(z.literal("")),
});

const CreateStepSchema = z.object({
  sequenceId: z.string().uuid(),
  delayDays: z.string().or(z.number()),
  action: z.string().default("reminder"),
  subject: z.string().trim().optional().or(z.literal("")),
  body: z.string().min(1, "Content is required"),
  senderName: z.string().trim().optional().or(z.literal("")),
  attachments: z.string().optional().or(z.literal("")),
});

const EnrollSchema = z.object({
  sequenceId: z.string().uuid(),
  leadId: z.string().uuid(),
});

export async function createSequence(
  _prev: SequenceFormState,
  formData: FormData,
): Promise<SequenceFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  const gate = await requireSequences(ctx.orgId);
  if (gate) return gate;

  const parsed = CreateSequenceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
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

  const [seq] = await db
    .insert(schema.sequences)
    .values({
      orgId: ctx.orgId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      createdBy: ctx.userId,
    })
    .returning();

  revalidatePath("/sequences");
  return { ok: true };
}

export async function deleteSequence(
  _prev: SequenceFormState,
  formData: FormData,
): Promise<SequenceFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const id = String(formData.get("id"));
  if (!z.string().uuid().safeParse(id).success) return { message: "Invalid ID" };
  await db
    .delete(schema.sequences)
    .where(and(eq(schema.sequences.id, id), eq(schema.sequences.orgId, ctx.orgId)));

  revalidatePath("/sequences");
  revalidatePath(`/sequences/${id}`);
  return { ok: true };
}

export async function toggleSequenceActive(
  _prev: SequenceFormState,
  formData: FormData,
): Promise<SequenceFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  const gate = await requireSequences(ctx.orgId);
  if (gate) return gate;

  const id = String(formData.get("id"));
  if (!z.string().uuid().safeParse(id).success) return { message: "Invalid ID" };
  const [seq] = await db
    .select()
    .from(schema.sequences)
    .where(and(eq(schema.sequences.id, id), eq(schema.sequences.orgId, ctx.orgId)))
    .limit(1);

  if (!seq) return { message: "Sequence not found" };

  await db
    .update(schema.sequences)
    .set({ active: !seq.active, updatedAt: new Date() })
    .where(and(eq(schema.sequences.id, id), eq(schema.sequences.orgId, ctx.orgId)));

  revalidatePath("/sequences");
  revalidatePath(`/sequences/${id}`);
  return { ok: true };
}

export async function addSequenceStep(
  _prev: SequenceFormState,
  formData: FormData,
): Promise<SequenceFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  const gate = await requireSequences(ctx.orgId);
  if (gate) return gate;

  const parsed = CreateStepSchema.safeParse({
    sequenceId: formData.get("sequenceId"),
    delayDays: formData.get("delayDays"),
    action: formData.get("action") || "reminder",
    subject: formData.get("subject"),
    body: formData.get("body"),
    senderName: formData.get("senderName"),
    attachments: formData.get("attachments"),
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

  // Verify sequence belongs to org.
  const [seq] = await db
    .select({ id: schema.sequences.id })
    .from(schema.sequences)
    .where(and(eq(schema.sequences.id, parsed.data.sequenceId), eq(schema.sequences.orgId, ctx.orgId)))
    .limit(1);
  if (!seq) return { message: "Sequence not found" };

  // Get current max position.
  const steps = await db
    .select()
    .from(schema.sequenceSteps)
    .where(eq(schema.sequenceSteps.sequenceId, parsed.data.sequenceId))
    .orderBy(schema.sequenceSteps.position);

  const nextPos = steps.length;

  // Parse attachments (JSON array of document IDs).
  let attachmentIds: string[] = [];
  if (parsed.data.attachments) {
    try {
      const parsedAttachments = JSON.parse(parsed.data.attachments);
      if (Array.isArray(parsedAttachments)) attachmentIds = parsedAttachments.filter((x) => typeof x === "string");
    } catch {
      // ignore invalid JSON
    }
  }

  await db.insert(schema.sequenceSteps).values({
    sequenceId: parsed.data.sequenceId,
    orgId: ctx.orgId,
    position: nextPos,
    delayDays: parseInt(String(parsed.data.delayDays)) || 0,
    action: parsed.data.action,
    subject: parsed.data.subject || null,
    body: parsed.data.body,
    senderName: parsed.data.senderName || null,
    attachments: attachmentIds,
  });

  revalidatePath("/sequences");
  revalidatePath(`/sequences/${parsed.data.sequenceId}`);
  return { ok: true };
}

export async function deleteSequenceStep(
  _prev: SequenceFormState,
  formData: FormData,
): Promise<SequenceFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const id = String(formData.get("id"));
  if (!z.string().uuid().safeParse(id).success) return { message: "Invalid ID" };
  const [step] = await db
    .select({ sequenceId: schema.sequenceSteps.sequenceId })
    .from(schema.sequenceSteps)
    .where(and(eq(schema.sequenceSteps.id, id), eq(schema.sequenceSteps.orgId, ctx.orgId)))
    .limit(1);

  await db
    .delete(schema.sequenceSteps)
    .where(and(eq(schema.sequenceSteps.id, id), eq(schema.sequenceSteps.orgId, ctx.orgId)));

  revalidatePath("/sequences");
  if (step) revalidatePath(`/sequences/${step.sequenceId}`);
  return { ok: true };
}

export async function enrollLead(
  _prev: SequenceFormState,
  formData: FormData,
): Promise<SequenceFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  const gate = await requireSequences(ctx.orgId);
  if (gate) return gate;

  const parsed = EnrollSchema.safeParse({
    sequenceId: formData.get("sequenceId"),
    leadId: formData.get("leadId"),
  });
  if (!parsed.success) {
    return { message: "Invalid input" };
  }

  // Verify lead belongs to org.
  const [lead] = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(and(eq(schema.leads.id, parsed.data.leadId), eq(schema.leads.orgId, ctx.orgId)))
    .limit(1);
  if (!lead) return { message: "Lead not found" };

  const result = await enrollLeadInSequence(
    ctx.orgId,
    parsed.data.leadId,
    parsed.data.sequenceId,
    ctx.userId,
  );

  if (!result.ok) return { message: result.message };

  revalidatePath("/sequences");
  revalidatePath(`/leads/${parsed.data.leadId}`);
  return { ok: true, message: "Enrolled in sequence" };
}

export async function unenrollLead(
  _prev: SequenceFormState,
  formData: FormData,
): Promise<SequenceFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const enrollmentId = String(formData.get("enrollmentId") ?? formData.get("id"));
  if (!z.string().uuid().safeParse(enrollmentId).success) return { message: "Invalid ID" };
  await db
    .update(schema.sequenceEnrollments)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(schema.sequenceEnrollments.id, enrollmentId),
        eq(schema.sequenceEnrollments.orgId, ctx.orgId),
      ),
    );

  revalidatePath("/sequences");
  return { ok: true, message: "Unenrolled from sequence" };
}

// ---------------------------------------------------------------------------
// Step editing
// ---------------------------------------------------------------------------

const UpdateStepSchema = z.object({
  stepId: z.string().uuid(),
  delayDays: z.string().or(z.number()),
  action: z.string().default("reminder"),
  subject: z.string().trim().optional().or(z.literal("")),
  body: z.string().min(1, "Content is required"),
  senderName: z.string().trim().optional().or(z.literal("")),
  attachments: z.string().optional().or(z.literal("")),
});

export async function updateSequenceStep(
  _prev: SequenceFormState,
  formData: FormData,
): Promise<SequenceFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  const gate = await requireSequences(ctx.orgId);
  if (gate) return gate;

  const parsed = UpdateStepSchema.safeParse({
    stepId: formData.get("stepId"),
    delayDays: formData.get("delayDays"),
    action: formData.get("action") || "reminder",
    subject: formData.get("subject"),
    body: formData.get("body"),
    senderName: formData.get("senderName"),
    attachments: formData.get("attachments"),
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

  // Verify step belongs to org.
  const [step] = await db
    .select({ id: schema.sequenceSteps.id, sequenceId: schema.sequenceSteps.sequenceId })
    .from(schema.sequenceSteps)
    .where(
      and(
        eq(schema.sequenceSteps.id, parsed.data.stepId),
        eq(schema.sequenceSteps.orgId, ctx.orgId),
      ),
    )
    .limit(1);
  if (!step) return { message: "Step not found" };

  let attachmentIds: string[] = [];
  if (parsed.data.attachments) {
    try {
      const parsedAttachments = JSON.parse(parsed.data.attachments);
      if (Array.isArray(parsedAttachments)) attachmentIds = parsedAttachments.filter((x) => typeof x === "string");
    } catch {
      // ignore
    }
  }

  await db
    .update(schema.sequenceSteps)
    .set({
      delayDays: parseInt(String(parsed.data.delayDays)) || 0,
      action: parsed.data.action,
      subject: parsed.data.subject || null,
      body: parsed.data.body,
      senderName: parsed.data.senderName || null,
      attachments: attachmentIds,
    })
    .where(and(eq(schema.sequenceSteps.id, parsed.data.stepId), eq(schema.sequenceSteps.orgId, ctx.orgId)));

  revalidatePath("/sequences");
  revalidatePath(`/sequences/${step.sequenceId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sequence settings (business hours, weekend skip)
// ---------------------------------------------------------------------------

const UpdateSequenceSettingsSchema = z.object({
  sequenceId: z.string().uuid(),
  sendWindowStart: z.string().trim().optional().or(z.literal("")),
  sendWindowEnd: z.string().trim().optional().or(z.literal("")),
  skipWeekends: z.string().optional(),
  timezone: z.string().trim().default("Africa/Lagos"),
});

export async function updateSequenceSettings(
  _prev: SequenceFormState,
  formData: FormData,
): Promise<SequenceFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  const gate = await requireSequences(ctx.orgId);
  if (gate) return gate;

  const parsed = UpdateSequenceSettingsSchema.safeParse({
    sequenceId: formData.get("sequenceId"),
    sendWindowStart: formData.get("sendWindowStart"),
    sendWindowEnd: formData.get("sendWindowEnd"),
    skipWeekends: formData.get("skipWeekends"),
    timezone: formData.get("timezone") || "Africa/Lagos",
  });
  if (!parsed.success) {
    return { message: "Invalid settings" };
  }

  // Verify sequence belongs to org.
  const [seq] = await db
    .select({ id: schema.sequences.id })
    .from(schema.sequences)
    .where(
      and(
        eq(schema.sequences.id, parsed.data.sequenceId),
        eq(schema.sequences.orgId, ctx.orgId),
      ),
    )
    .limit(1);
  if (!seq) return { message: "Sequence not found" };

  await db
    .update(schema.sequences)
    .set({
      sendWindowStart: parsed.data.sendWindowStart || null,
      sendWindowEnd: parsed.data.sendWindowEnd || null,
      skipWeekends: formData.get("skipWeekends") === "true",
      timezone: parsed.data.timezone,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.sequences.id, parsed.data.sequenceId), eq(schema.sequences.orgId, ctx.orgId)));

  revalidatePath("/sequences");
  revalidatePath(`/sequences/${parsed.data.sequenceId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Bulk enrollment
// ---------------------------------------------------------------------------

const BulkEnrollSchema = z.object({
  sequenceId: z.string().uuid(),
  leadIds: z.string(),
});

export async function bulkEnrollLeads(
  _prev: SequenceFormState,
  formData: FormData,
): Promise<SequenceFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  const gate = await requireSequences(ctx.orgId);
  if (gate) return gate;

  const parsed = BulkEnrollSchema.safeParse({
    sequenceId: formData.get("sequenceId"),
    leadIds: formData.get("leadIds"),
  });
  if (!parsed.success) return { message: "Invalid input" };

  const leadIds = parsed.data.leadIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (leadIds.length === 0) return { message: "No leads selected" };

  // Verify sequence belongs to org and is active.
  const [seq] = await db
    .select({ id: schema.sequences.id, active: schema.sequences.active })
    .from(schema.sequences)
    .where(
      and(
        eq(schema.sequences.id, parsed.data.sequenceId),
        eq(schema.sequences.orgId, ctx.orgId),
      ),
    )
    .limit(1);
  if (!seq) return { message: "Sequence not found" };
  if (!seq.active) return { message: "Sequence is not active" };

  const { enrollLeadInSequence } = await import("@/lib/sequences");
  let enrolled = 0;
  let skipped = 0;
  for (const leadId of leadIds) {
    const result = await enrollLeadInSequence(ctx.orgId, leadId, parsed.data.sequenceId, ctx.userId);
    if (result.ok) enrolled++;
    else skipped++;
  }

  revalidatePath("/sequences");
  revalidatePath("/leads");
  return { ok: true, message: `Enrolled ${enrolled} lead${enrolled === 1 ? "" : "s"}${skipped > 0 ? `, skipped ${skipped}` : ""}` };
}

// ---------------------------------------------------------------------------
// Pause / resume enrollment
// ---------------------------------------------------------------------------

export async function pauseEnrollment(
  _prev: SequenceFormState,
  formData: FormData,
): Promise<SequenceFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const enrollmentId = String(formData.get("enrollmentId"));
  if (!z.string().uuid().safeParse(enrollmentId).success) return { message: "Invalid ID" };
  await db
    .update(schema.sequenceEnrollments)
    .set({ status: "paused", pausedReason: "manual", pausedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(schema.sequenceEnrollments.id, enrollmentId),
        eq(schema.sequenceEnrollments.orgId, ctx.orgId),
      ),
    );

  revalidatePath("/sequences");
  return { ok: true };
}

export async function resumeEnrollment(
  _prev: SequenceFormState,
  formData: FormData,
): Promise<SequenceFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const enrollmentId = String(formData.get("enrollmentId"));
  if (!z.string().uuid().safeParse(enrollmentId).success) return { message: "Invalid ID" };
  await db
    .update(schema.sequenceEnrollments)
    .set({ status: "active", pausedReason: null, pausedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(schema.sequenceEnrollments.id, enrollmentId),
        eq(schema.sequenceEnrollments.orgId, ctx.orgId),
      ),
    );

  revalidatePath("/sequences");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Sequence templates
// ---------------------------------------------------------------------------

const CreateTemplateSchema = z.object({
  name: z.string().min(1, "Name is required").trim(),
  description: z.string().trim().optional().or(z.literal("")),
  category: z.string().trim().default("general"),
  definition: z.string(),
});

export async function createSequenceTemplate(
  _prev: SequenceFormState,
  formData: FormData,
): Promise<SequenceFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const parsed = CreateTemplateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    category: formData.get("category") || "general",
    definition: formData.get("definition"),
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

  let definition: unknown;
  try {
    definition = JSON.parse(parsed.data.definition);
  } catch {
    return { errors: { definition: ["Invalid JSON"] } };
  }

  await db.insert(schema.sequenceTemplates).values({
    orgId: ctx.orgId,
    name: parsed.data.name,
    description: parsed.data.description || null,
    category: parsed.data.category,
    definition: definition as any,
    createdBy: ctx.userId,
  });

  revalidatePath("/sequences");
  return { ok: true };
}

export async function deleteSequenceTemplate(
  _prev: SequenceFormState,
  formData: FormData,
): Promise<SequenceFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const id = String(formData.get("id"));
  if (!z.string().uuid().safeParse(id).success) return { message: "Invalid ID" };
  await db
    .delete(schema.sequenceTemplates)
    .where(
      and(
        eq(schema.sequenceTemplates.id, id),
        eq(schema.sequenceTemplates.orgId, ctx.orgId),
      ),
    );

  revalidatePath("/sequences");
  return { ok: true };
}

export async function createSequenceFromTemplate(
  _prev: SequenceFormState,
  formData: FormData,
): Promise<SequenceFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  const gate = await requireSequences(ctx.orgId);
  if (gate) return gate;

  const templateId = String(formData.get("templateId"));
  if (!z.string().uuid().safeParse(templateId).success) return { message: "Invalid ID" };
  const [template] = await db
    .select()
    .from(schema.sequenceTemplates)
    .where(
      and(
        eq(schema.sequenceTemplates.id, templateId),
        eq(schema.sequenceTemplates.orgId, ctx.orgId),
      ),
    )
    .limit(1);

  if (!template) return { message: "Template not found" };

  const def = template.definition as { name?: string; description?: string; steps?: any[] };

  // Create the sequence
  const [seq] = await db
    .insert(schema.sequences)
    .values({
      orgId: ctx.orgId,
      name: def.name || template.name,
      description: def.description || template.description,
      createdBy: ctx.userId,
    })
    .returning();

  // Create steps from template definition
  if (def.steps && Array.isArray(def.steps)) {
    for (let i = 0; i < def.steps.length; i++) {
      const s = def.steps[i];
      await db.insert(schema.sequenceSteps).values({
        sequenceId: seq.id,
        orgId: ctx.orgId,
        position: i,
        delayDays: s.delayDays || 0,
        action: s.action || "reminder",
        subject: s.subject || null,
        body: s.body || "",
        senderName: s.senderName || null,
      });
    }
  }

  revalidatePath("/sequences");
  return { ok: true };
}
