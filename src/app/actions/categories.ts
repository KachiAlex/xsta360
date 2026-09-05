"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySession } from "@/lib/dal";
import { logEvent } from "@/lib/audit";
import { enrollLeadInSequence } from "@/lib/sequences";

export type CategoryFormState = {
  errors?: Record<string, string[]>;
  message?: string;
  ok?: boolean;
};

const CreateCategorySchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  description: z.string().max(200).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color").optional(),
  icon: z.string().min(1).max(4).optional(),
  linkedSequenceId: z.string().uuid().optional(),
  defaultAssigneeId: z.string().uuid().optional(),
  followUpCadenceDays: z.coerce.number().int().min(1).max(365).optional(),
});

/**
 * Create a new lead category.
 */
export async function createCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (ctx.role !== "admin" && ctx.role !== "manager") {
    return { message: "Only admins and managers can create categories" };
  }

  const parsed = CreateCategorySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    color: formData.get("color") || undefined,
    icon: formData.get("icon") || undefined,
    linkedSequenceId: formData.get("linkedSequenceId") || undefined,
    defaultAssigneeId: formData.get("defaultAssigneeId") || undefined,
    followUpCadenceDays: formData.get("followUpCadenceDays") || undefined,
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const [cat] = await db
    .insert(schema.leadCategories)
    .values({
      orgId: ctx.orgId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      color: parsed.data.color ?? "#4A5750",
      icon: parsed.data.icon ?? "🏷️",
      linkedSequenceId: parsed.data.linkedSequenceId ?? null,
      defaultAssigneeId: parsed.data.defaultAssigneeId ?? null,
      followUpCadenceDays: parsed.data.followUpCadenceDays ?? null,
      createdBy: ctx.userId,
    })
    .returning();

  await logEvent(ctx.orgId, "category_created", {
    actorId: ctx.userId,
    meta: { categoryId: cat.id, name: cat.name },
  });

  revalidatePath("/categories");
  revalidatePath("/leads");
  return { ok: true, message: "Category created" };
}

/**
 * Update an existing category.
 */
export async function updateCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (ctx.role !== "admin" && ctx.role !== "manager") {
    return { message: "Only admins and managers can update categories" };
  }

  const id = String(formData.get("id"));
  if (!id) return { message: "Category ID is required" };
  if (!z.string().uuid().safeParse(id).success) return { message: "Invalid ID" };

  const parsed = CreateCategorySchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    color: formData.get("color") || undefined,
    icon: formData.get("icon") || undefined,
    linkedSequenceId: formData.get("linkedSequenceId") || undefined,
    defaultAssigneeId: formData.get("defaultAssigneeId") || undefined,
    followUpCadenceDays: formData.get("followUpCadenceDays") || undefined,
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  await db
    .update(schema.leadCategories)
    .set({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      color: parsed.data.color ?? "#4A5750",
      icon: parsed.data.icon ?? "🏷️",
      linkedSequenceId: parsed.data.linkedSequenceId ?? null,
      defaultAssigneeId: parsed.data.defaultAssigneeId ?? null,
      followUpCadenceDays: parsed.data.followUpCadenceDays ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(schema.leadCategories.id, id), eq(schema.leadCategories.orgId, ctx.orgId)),
    );

  revalidatePath("/categories");
  revalidatePath("/leads");
  return { ok: true, message: "Category updated" };
}

/**
 * Delete a category (removes all assignments, unenrolls from linked sequences).
 */
export async function deleteCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (ctx.role !== "admin" && ctx.role !== "manager") {
    return { message: "Only admins and managers can delete categories" };
  }

  const id = String(formData.get("id"));
  if (!id) return { message: "Category ID is required" };
  if (!z.string().uuid().safeParse(id).success) return { message: "Invalid ID" };

  // Cascade delete handles assignments.
  await db
    .delete(schema.leadCategories)
    .where(
      and(eq(schema.leadCategories.id, id), eq(schema.leadCategories.orgId, ctx.orgId)),
    );

  revalidatePath("/categories");
  revalidatePath("/leads");
  return { ok: true, message: "Category deleted" };
}

/**
 * Assign a lead to a category.
 * Auto-enrolls in linked sequence, auto-assigns rep, auto-schedules follow-up.
 */
export async function assignLeadToCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const leadId = String(formData.get("leadId"));
  const categoryId = String(formData.get("categoryId"));
  if (!leadId || !categoryId) return { message: "leadId and categoryId are required" };
  if (!z.string().uuid().safeParse(leadId).success) return { message: "Invalid lead ID" };
  if (!z.string().uuid().safeParse(categoryId).success) return { message: "Invalid category ID" };

  // Verify lead belongs to org.
  const [lead] = await db
    .select()
    .from(schema.leads)
    .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, ctx.orgId)))
    .limit(1);
  if (!lead) return { message: "Lead not found" };

  // Verify category belongs to org.
  const [cat] = await db
    .select()
    .from(schema.leadCategories)
    .where(
      and(eq(schema.leadCategories.id, categoryId), eq(schema.leadCategories.orgId, ctx.orgId)),
    )
    .limit(1);
  if (!cat) return { message: "Category not found" };

  // Check if already assigned (unique constraint will catch this, but check first for UX).
  const [existing] = await db
    .select()
    .from(schema.leadCategoryAssignments)
    .where(
      and(
        eq(schema.leadCategoryAssignments.leadId, leadId),
        eq(schema.leadCategoryAssignments.categoryId, categoryId),
      ),
    )
    .limit(1);
  if (existing) return { message: "Lead already in this category" };

  // Create the assignment.
  await db.insert(schema.leadCategoryAssignments).values({
    leadId,
    categoryId,
    orgId: ctx.orgId,
    assignedBy: ctx.userId,
  });

  // --- Auto-enrollment logic ---

  // 1. Auto-enroll in linked sequence.
  if (cat.linkedSequenceId) {
    await enrollLeadInSequence(ctx.orgId, leadId, cat.linkedSequenceId, ctx.userId).catch((e) =>
      console.error("Auto-enroll in sequence failed:", e),
    );
  }

  // 2. Auto-assign to default assignee.
  if (cat.defaultAssigneeId && lead.assigneeId !== cat.defaultAssigneeId) {
    await db
      .update(schema.leads)
      .set({ assigneeId: cat.defaultAssigneeId, updatedAt: new Date() })
      .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, ctx.orgId)));
  }

  // 3. Auto-schedule follow-up based on cadence.
  if (cat.followUpCadenceDays) {
    const dueAt = new Date(Date.now() + cat.followUpCadenceDays * 86_400_000);
    await db.insert(schema.reminders).values({
      leadId,
      orgId: ctx.orgId,
      assigneeId: cat.defaultAssigneeId ?? lead.assigneeId,
      dueAt,
      note: `[Category: ${cat.name}] Follow-up scheduled by category cadence`,
      channel: "reminder",
    });
  }

  await logEvent(ctx.orgId, "lead_category_assigned", {
    leadId,
    actorId: ctx.userId,
    meta: { categoryId, categoryName: cat.name },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/categories");
  return { ok: true, message: `Added to ${cat.name}` };
}

/**
 * Remove a lead from a category.
 * Auto-unenrolls from the category's linked sequence.
 */
export async function removeLeadFromCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const leadId = String(formData.get("leadId"));
  const categoryId = String(formData.get("categoryId"));
  if (!leadId || !categoryId) return { message: "leadId and categoryId are required" };
  if (!z.string().uuid().safeParse(leadId).success) return { message: "Invalid lead ID" };
  if (!z.string().uuid().safeParse(categoryId).success) return { message: "Invalid category ID" };

  // Get the category to find linked sequence.
  const [cat] = await db
    .select()
    .from(schema.leadCategories)
    .where(
      and(eq(schema.leadCategories.id, categoryId), eq(schema.leadCategories.orgId, ctx.orgId)),
    )
    .limit(1);

  // Remove the assignment.
  await db
    .delete(schema.leadCategoryAssignments)
    .where(
      and(
        eq(schema.leadCategoryAssignments.leadId, leadId),
        eq(schema.leadCategoryAssignments.categoryId, categoryId),
        eq(schema.leadCategoryAssignments.orgId, ctx.orgId),
      ),
    );

  // Auto-unenroll from linked sequence.
  if (cat?.linkedSequenceId) {
    await db
      .update(schema.sequenceEnrollments)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(
        and(
          eq(schema.sequenceEnrollments.leadId, leadId),
          eq(schema.sequenceEnrollments.sequenceId, cat.linkedSequenceId),
          eq(schema.sequenceEnrollments.status, "active"),
          eq(schema.sequenceEnrollments.orgId, ctx.orgId),
        ),
      );
  }

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/leads");
  revalidatePath("/categories");
  return { ok: true, message: `Removed from ${cat?.name ?? "category"}` };
}

/**
 * Bulk assign multiple leads to a category.
 */
export async function bulkAssignCategory(
  _prev: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const categoryId = String(formData.get("categoryId"));
  const leadIdsRaw = String(formData.get("leadIds") ?? "");
  const leadIds = leadIdsRaw.split(",").filter(Boolean);
  if (!categoryId || leadIds.length === 0) {
    return { message: "categoryId and leadIds are required" };
  }
  if (!z.string().uuid().safeParse(categoryId).success) return { message: "Invalid category ID" };

  // Verify category.
  const [cat] = await db
    .select()
    .from(schema.leadCategories)
    .where(
      and(eq(schema.leadCategories.id, categoryId), eq(schema.leadCategories.orgId, ctx.orgId)),
    )
    .limit(1);
  if (!cat) return { message: "Category not found" };

  let assigned = 0;
  for (const leadId of leadIds) {
    // Skip if already assigned.
    const [existing] = await db
      .select()
      .from(schema.leadCategoryAssignments)
      .where(
        and(
          eq(schema.leadCategoryAssignments.leadId, leadId),
          eq(schema.leadCategoryAssignments.categoryId, categoryId),
        ),
      )
      .limit(1);
    if (existing) continue;

    await db.insert(schema.leadCategoryAssignments).values({
      leadId,
      categoryId,
      orgId: ctx.orgId,
      assignedBy: ctx.userId,
    });

    // Auto-enroll in sequence.
    if (cat.linkedSequenceId) {
      await enrollLeadInSequence(ctx.orgId, leadId, cat.linkedSequenceId, ctx.userId).catch(() => {});
    }

    // Auto-assign rep.
    if (cat.defaultAssigneeId) {
      await db
        .update(schema.leads)
        .set({ assigneeId: cat.defaultAssigneeId, updatedAt: new Date() })
        .where(and(eq(schema.leads.id, leadId), eq(schema.leads.orgId, ctx.orgId)));
    }

    // Auto-schedule follow-up.
    if (cat.followUpCadenceDays) {
      const dueAt = new Date(Date.now() + cat.followUpCadenceDays * 86_400_000);
      await db.insert(schema.reminders).values({
        leadId,
        orgId: ctx.orgId,
        assigneeId: cat.defaultAssigneeId,
        dueAt,
        note: `[Category: ${cat.name}] Follow-up scheduled by category cadence`,
        channel: "reminder",
      });
    }

    assigned++;
  }

  revalidatePath("/leads");
  revalidatePath("/categories");
  return { ok: true, message: `${assigned} lead${assigned !== 1 ? "s" : ""} added to ${cat.name}` };
}
