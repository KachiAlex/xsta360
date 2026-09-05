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
  await db
    .delete(schema.sequences)
    .where(and(eq(schema.sequences.id, id), eq(schema.sequences.orgId, ctx.orgId)));

  revalidatePath("/sequences");
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
  const [seq] = await db
    .select()
    .from(schema.sequences)
    .where(and(eq(schema.sequences.id, id), eq(schema.sequences.orgId, ctx.orgId)))
    .limit(1);

  if (!seq) return { message: "Sequence not found" };

  await db
    .update(schema.sequences)
    .set({ active: !seq.active, updatedAt: new Date() })
    .where(eq(schema.sequences.id, id));

  revalidatePath("/sequences");
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

  await db.insert(schema.sequenceSteps).values({
    sequenceId: parsed.data.sequenceId,
    orgId: ctx.orgId,
    position: nextPos,
    delayDays: parseInt(String(parsed.data.delayDays)) || 0,
    action: parsed.data.action,
    subject: parsed.data.subject || null,
    body: parsed.data.body,
    senderName: parsed.data.senderName || null,
  });

  revalidatePath("/sequences");
  return { ok: true };
}

export async function deleteSequenceStep(
  _prev: SequenceFormState,
  formData: FormData,
): Promise<SequenceFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const id = String(formData.get("id"));
  await db
    .delete(schema.sequenceSteps)
    .where(and(eq(schema.sequenceSteps.id, id), eq(schema.sequenceSteps.orgId, ctx.orgId)));

  revalidatePath("/sequences");
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
