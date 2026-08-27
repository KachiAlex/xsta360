"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySession, can } from "@/lib/dal";

export type OrgFormState = { errors?: Record<string, string[]>; message?: string; ok?: boolean };

const StageSchema = z.object({
  name: z.string().min(1, "Name is required").trim(),
  kind: z.enum(["open", "won", "lost"]),
});

const UpdateStageSchema = z.object({
  stageId: z.string().uuid(),
  name: z.string().min(1, "Name is required").trim(),
});

export async function addStage(
  _prev: OrgFormState,
  formData: FormData,
): Promise<OrgFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "configure")) return { message: "Only admins can configure stages" };

  const parsed = StageSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
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

  // Position = max existing + 1.
  const stages = await db
    .select({ position: schema.pipelineStages.position })
    .from(schema.pipelineStages)
    .where(eq(schema.pipelineStages.orgId, ctx.orgId));
  const maxPos = stages.reduce((m, s) => Math.max(m, s.position), -1);

  await db.insert(schema.pipelineStages).values({
    ...parsed.data,
    orgId: ctx.orgId,
    position: maxPos + 1,
  });

  revalidatePath("/settings");
  revalidatePath("/pipeline");
  return { ok: true };
}

export async function updateStage(
  _prev: OrgFormState,
  formData: FormData,
): Promise<OrgFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "configure")) return { message: "Only admins can configure stages" };

  const parsed = UpdateStageSchema.safeParse({
    stageId: formData.get("stageId"),
    name: formData.get("name"),
  });
  if (!parsed.success) {
    return { errors: { name: ["Name is required"] } };
  }

  const [stage] = await db
    .select()
    .from(schema.pipelineStages)
    .where(
      and(eq(schema.pipelineStages.id, parsed.data.stageId), eq(schema.pipelineStages.orgId, ctx.orgId)),
    )
    .limit(1);
  if (!stage) return { message: "Stage not found" };

  await db
    .update(schema.pipelineStages)
    .set({ name: parsed.data.name })
    .where(eq(schema.pipelineStages.id, stage.id));

  revalidatePath("/settings");
  revalidatePath("/pipeline");
  return { ok: true };
}

export async function deleteStage(
  _prev: OrgFormState,
  formData: FormData,
): Promise<OrgFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "configure")) return { message: "Only admins can configure stages" };

  const stageId = String(formData.get("stageId"));
  const [stage] = await db
    .select()
    .from(schema.pipelineStages)
    .where(
      and(eq(schema.pipelineStages.id, stageId), eq(schema.pipelineStages.orgId, ctx.orgId)),
    )
    .limit(1);
  if (!stage) return { message: "Stage not found" };

  await db.delete(schema.pipelineStages).where(eq(schema.pipelineStages.id, stage.id));

  revalidatePath("/settings");
  revalidatePath("/pipeline");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Stage probability (for forecasting)
// ---------------------------------------------------------------------------

export async function updateStageProbability(
  _prev: OrgFormState,
  formData: FormData,
): Promise<OrgFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "configure")) return { message: "Only admins can configure stages" };

  const stageId = String(formData.get("stageId"));
  const probabilityStr = String(formData.get("probability") || "0");
  const probability = Math.max(0, Math.min(100, parseInt(probabilityStr) || 0));

  const [stage] = await db
    .select()
    .from(schema.pipelineStages)
    .where(
      and(eq(schema.pipelineStages.id, stageId), eq(schema.pipelineStages.orgId, ctx.orgId)),
    )
    .limit(1);
  if (!stage) return { message: "Stage not found" };

  await db
    .update(schema.pipelineStages)
    .set({ probability })
    .where(eq(schema.pipelineStages.id, stage.id));

  revalidatePath("/settings");
  revalidatePath("/pipeline");
  revalidatePath("/reports");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Org settings: WhatsApp config, custom fields, currency
// ---------------------------------------------------------------------------

export async function updateOrgSettings(
  _prev: OrgFormState,
  formData: FormData,
): Promise<OrgFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "configure")) return { message: "Only admins can change org settings" };

  const currency = String(formData.get("currency") || "₦");
  const whatsappEnabled = formData.get("whatsappEnabled") === "true";
  const whatsappPhoneNumberId = String(formData.get("whatsappPhoneNumberId") || "");
  const whatsappApiKey = String(formData.get("whatsappApiKey") || "");
  const customFieldsJson = String(formData.get("customFields") || "[]");

  let customFieldDefs: unknown = [];
  try {
    customFieldDefs = JSON.parse(customFieldsJson);
  } catch {
    return { errors: { customFields: ["Invalid JSON for custom field definitions"] } };
  }

  const whatsappConfig = whatsappEnabled
    ? {
        enabled: true,
        phoneNumberId: whatsappPhoneNumberId || undefined,
        apiKey: whatsappApiKey || undefined,
      }
    : { enabled: false };

  await db
    .update(schema.organizations)
    .set({
      currency,
      customFieldDefs: customFieldDefs as any,
      whatsappConfig: whatsappConfig as any,
      updatedAt: new Date(),
    })
    .where(eq(schema.organizations.id, ctx.orgId));

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}
