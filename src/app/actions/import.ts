"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySession } from "@/lib/dal";
import { logEvent } from "@/lib/audit";

export type ImportFormState = {
  ok?: boolean;
  message?: string;
  imported?: number;
  errors?: string[];
};

const RowSchema = z.object({
  name: z.string().min(1, "Name is required"),
  company: z.string().optional().or(z.literal("")),
  email: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  source: z.enum(["referral", "social", "ad", "walk_in", "embedded_form", "other"]).optional().or(z.literal("")),
  campaign: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

// Accepts a JSON array of row objects (already mapped client-side).
export async function importLeads(
  _prev: ImportFormState,
  formData: FormData,
): Promise<ImportFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };

  const rowsJson = String(formData.get("rows") ?? "[]");
  let rows: unknown;
  try {
    rows = JSON.parse(rowsJson);
  } catch {
    return { message: "Invalid data payload" };
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { message: "No rows to import" };
  }

  // First open stage for default assignment.
  const [firstStage] = await db
    .select()
    .from(schema.pipelineStages)
    .where(and(eq(schema.pipelineStages.orgId, ctx.orgId), eq(schema.pipelineStages.kind, "open")))
    .orderBy(schema.pipelineStages.position)
    .limit(1);

  let imported = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const parsed = RowSchema.safeParse(rows[i]);
    if (!parsed.success) {
      errors.push(`Row ${i + 2}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    const r = parsed.data;
    try {
      const [lead] = await db
        .insert(schema.leads)
        .values({
          orgId: ctx.orgId,
          name: r.name,
          company: r.company || null,
          email: r.email || null,
          phone: r.phone || null,
          source: (r.source || "other") as never,
          campaign: r.campaign || null,
          notes: r.notes || null,
          stageId: firstStage?.id,
          assigneeId: ctx.userId,
          createdById: ctx.userId,
        })
        .returning();
      await logEvent(ctx.orgId, "lead_created", {
        leadId: lead.id,
        actorId: ctx.userId,
        meta: { source: lead.source, via: "csv_import" },
      });
      imported++;
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : "insert failed"}`);
    }
  }

  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  return { ok: true, imported, errors: errors.length ? errors : undefined };
}
