"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySession, type AuthContext } from "@/lib/dal";
import { logEvent } from "@/lib/audit";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const ActivityTypeEnum = z.enum(["call", "email", "meeting", "note", "visit"]);

const LogActivitySchema = z.object({
  leadId: z.string().uuid(),
  type: ActivityTypeEnum,
  body: z.string().min(1, "Describe what happened").trim(),
  // ISO string or datetime-local string; defaults to now if empty.
  occurredAt: z.string().optional().or(z.literal("")),
  // Optional next follow-up reminder.
  reminderDue: z.string().optional().or(z.literal("")),
  reminderType: z.string().optional().or(z.literal("")),
});

export type ActivityFormState = {
  errors?: Record<string, string[]>;
  message?: string;
  ok?: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadOrgLead(ctx: AuthContext, leadId: string) {
  const [lead] = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, ctx.orgId)))
    .limit(1);
  return lead ?? null;
}

// ---------------------------------------------------------------------------
// Log activity (+ optional next reminder)
// ---------------------------------------------------------------------------

export async function logActivity(
  _prev: ActivityFormState,
  formData: FormData,
): Promise<ActivityFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const parsed = LogActivitySchema.safeParse({
    leadId: formData.get("leadId"),
    type: formData.get("type"),
    body: formData.get("body"),
    occurredAt: formData.get("occurredAt"),
    reminderDue: formData.get("reminderDue"),
    reminderType: formData.get("reminderType"),
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

  const { leadId, type, body, occurredAt, reminderDue, reminderType } = parsed.data;
  const lead = await loadOrgLead(ctx, leadId);
  if (!lead) return { message: "Lead not found" };

  // Parse occurredAt — default to now.
  const occurred = occurredAt ? new Date(occurredAt) : new Date();
  if (isNaN(occurred.getTime())) {
    return { errors: { occurredAt: ["Invalid date"] } };
  }

  let reminderId: string | null = null;

  // Optional: create a next follow-up reminder.
  if (reminderDue) {
    const dueAt = new Date(reminderDue);
    if (!isNaN(dueAt.getTime())) {
      const note = reminderType ? `${reminderType}: ${body}` : body;
      const [reminder] = await db
        .insert(schema.reminders)
        .values({
          leadId,
          orgId: ctx.orgId,
          assigneeId: lead.assigneeId ?? ctx.userId,
          dueAt,
          note,
        })
        .returning();
      reminderId = reminder.id;
      await logEvent(ctx.orgId, "reminder_set", {
        leadId,
        actorId: ctx.userId,
        meta: { reminderId: reminder.id, dueAt: dueAt.toISOString() },
      });
    }
  }

  const [activity] = await db
    .insert(schema.activities)
    .values({
      leadId,
      orgId: ctx.orgId,
      authorId: ctx.userId,
      type,
      body,
      occurredAt: occurred,
      reminderId,
    })
    .returning();

  await logEvent(ctx.orgId, "activity_logged", {
    leadId,
    actorId: ctx.userId,
    meta: { activityId: activity.id, type, occurredAt: occurred.toISOString() },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Complete / snooze reminder (used by inline dashboard buttons)
// ---------------------------------------------------------------------------

export async function completeReminderFromDashboard(
  _prev: ActivityFormState,
  formData: FormData,
): Promise<ActivityFormState> {
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

export async function snoozeReminderFromDashboard(
  _prev: ActivityFormState,
  formData: FormData,
): Promise<ActivityFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const reminderId = String(formData.get("reminderId"));
  const dueAtStr = String(formData.get("dueAt") || "");
  const dueAt = new Date(dueAtStr);
  if (isNaN(dueAt.getTime())) {
    return { errors: { dueAt: ["Pick a valid date"] } };
  }

  const [reminder] = await db
    .update(schema.reminders)
    .set({ status: "snoozed", dueAt, updatedAt: new Date() })
    .where(
      and(
        eq(schema.reminders.id, reminderId),
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

// ---------------------------------------------------------------------------
// Set a standalone reminder (no activity required)
// ---------------------------------------------------------------------------

const SetReminderSchema = z.object({
  leadId: z.string().uuid(),
  dueAt: z.string().min(1, "Pick a date"),
  note: z.string().trim().optional().or(z.literal("")),
});

export async function setReminder(
  _prev: ActivityFormState,
  formData: FormData,
): Promise<ActivityFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const parsed = SetReminderSchema.safeParse({
    leadId: formData.get("leadId"),
    dueAt: formData.get("dueAt"),
    note: formData.get("note"),
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

  const { leadId, dueAt, note } = parsed.data;
  const lead = await loadOrgLead(ctx, leadId);
  if (!lead) return { message: "Lead not found" };

  const due = new Date(dueAt);
  if (isNaN(due.getTime())) {
    return { errors: { dueAt: ["Invalid date"] } };
  }

  const [reminder] = await db
    .insert(schema.reminders)
    .values({
      leadId,
      orgId: ctx.orgId,
      assigneeId: lead.assigneeId ?? ctx.userId,
      dueAt: due,
      note: note || "Follow-up reminder",
    })
    .returning();

  await logEvent(ctx.orgId, "reminder_set", {
    leadId,
    actorId: ctx.userId,
    meta: { reminderId: reminder.id, dueAt: due.toISOString(), note: note || null },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Delete a reminder
// ---------------------------------------------------------------------------

export async function deleteReminder(
  _prev: ActivityFormState,
  formData: FormData,
): Promise<ActivityFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const reminderId = String(formData.get("reminderId"));
  const [reminder] = await db
    .delete(schema.reminders)
    .where(
      and(
        eq(schema.reminders.id, reminderId),
        eq(schema.reminders.orgId, ctx.orgId),
      ),
    )
    .returning();

  if (!reminder) return { message: "Reminder not found" };

  revalidatePath("/dashboard");
  revalidatePath(`/leads/${reminder.leadId}`);
  return { ok: true };
}
