"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, count } from "drizzle-orm";
import { db, schema } from "@/db";
import { verifySession, can } from "@/lib/dal";
import { logEvent } from "@/lib/audit";

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

  await logEvent(ctx.orgId, "stage_created", {
    actorId: ctx.userId,
    meta: { name: parsed.data.name, kind: parsed.data.kind },
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
    .where(and(eq(schema.pipelineStages.id, stage.id), eq(schema.pipelineStages.orgId, ctx.orgId)));

  await logEvent(ctx.orgId, "stage_updated", {
    actorId: ctx.userId,
    meta: { stageId: stage.id, oldName: stage.name, newName: parsed.data.name },
  });

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
  if (!z.string().uuid().safeParse(stageId).success) return { message: "Invalid ID" };
  const [stage] = await db
    .select()
    .from(schema.pipelineStages)
    .where(
      and(eq(schema.pipelineStages.id, stageId), eq(schema.pipelineStages.orgId, ctx.orgId)),
    )
    .limit(1);
  if (!stage) return { message: "Stage not found" };

  // Prevent deleting a stage that still has leads — reassign them first.
  const [{ value: leadCount }] = await db
    .select({ value: count() })
    .from(schema.leads)
    .where(eq(schema.leads.stageId, stage.id));
  if (leadCount > 0) {
    return { message: `Cannot delete: ${leadCount} lead(s) are in this stage. Move them first.` };
  }

  await db.delete(schema.pipelineStages).where(and(eq(schema.pipelineStages.id, stage.id), eq(schema.pipelineStages.orgId, ctx.orgId)));

  await logEvent(ctx.orgId, "stage_deleted", {
    actorId: ctx.userId,
    meta: { stageId: stage.id, stageName: stage.name },
  });

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
  if (!z.string().uuid().safeParse(stageId).success) return { message: "Invalid ID" };
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
    .where(and(eq(schema.pipelineStages.id, stage.id), eq(schema.pipelineStages.orgId, ctx.orgId)));

  await logEvent(ctx.orgId, "stage_probability_updated", {
    actorId: ctx.userId,
    meta: { stageId: stage.id, probability },
  });

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
  const replyToEmail = String(formData.get("replyToEmail") || "").trim() || null;
  const whatsappEnabled = formData.get("whatsappEnabled") === "true";
  const whatsappPhoneNumberId = String(formData.get("whatsappPhoneNumberId") || "");
  const whatsappWabaId = String(formData.get("whatsappWabaId") || "");
  const whatsappApiKey = String(formData.get("whatsappApiKey") || "");
  const customFieldsJson = String(formData.get("customFields") || "[]");

  let customFieldDefs: unknown = [];
  try {
    customFieldDefs = JSON.parse(customFieldsJson);
  } catch {
    return { errors: { customFields: ["Invalid JSON for custom field definitions"] } };
  }

  // Phone Number ID is a numeric Meta ID — reject phone numbers pasted by mistake.
  const phoneNumberIdClean = whatsappPhoneNumberId.trim();
  if (whatsappEnabled && phoneNumberIdClean && !/^\d+$/.test(phoneNumberIdClean)) {
    return {
      message:
        "Phone Number ID must be digits only (e.g. 1249837834878071) — it's the numeric ID under the number in Meta's API Setup, not the phone number itself",
      errors: {
        whatsappPhoneNumberId: ["Must be the numeric Phone Number ID, not the phone number"],
      },
    };
  }
  // WABA ID is also numeric — same validation.
  const wabaIdClean = whatsappWabaId.trim();
  if (whatsappEnabled && wabaIdClean && !/^\d+$/.test(wabaIdClean)) {
    return {
      message: "WhatsApp Business Account ID must be digits only",
      errors: { whatsappWabaId: ["Must be the numeric WABA ID"] },
    };
  }

  const whatsappConfig = whatsappEnabled
    ? {
        enabled: true,
        phoneNumberId: phoneNumberIdClean || undefined,
        wabaId: wabaIdClean || undefined,
        apiKey: whatsappApiKey.trim() || undefined,
      }
    : { enabled: false };

  await db
    .update(schema.organizations)
    .set({
      currency,
      replyToEmail,
      customFieldDefs: customFieldDefs as any,
      whatsappConfig: whatsappConfig as any,
      updatedAt: new Date(),
    })
    .where(eq(schema.organizations.id, ctx.orgId));

  await logEvent(ctx.orgId, "org_settings_updated", {
    actorId: ctx.userId,
    meta: { currency, whatsappEnabled, replyToEmail },
  });

  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// WhatsApp Embedded Signup — one-click connect via Meta's Facebook Login for
// Business. The client collects an auth code + waba_id + phone_number_id;
// we exchange the code for a WABA access token and store it on the org.
// ---------------------------------------------------------------------------

export async function connectWhatsAppEmbedded(
  code: string,
  phoneNumberId: string,
  wabaId: string,
): Promise<OrgFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "configure")) return { message: "Only admins can change org settings" };

  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return { message: "WhatsApp integration is not configured on this server" };
  }
  if (!code || !phoneNumberId || !wabaId) {
    return { message: "Incomplete WhatsApp setup — missing code, phone number, or account" };
  }

  // Exchange the short-lived auth code for a WABA access token.
  const tokenRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`,
  );
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenData?.access_token) {
    return { message: "Could not finish WhatsApp connection. Please try again." };
  }
  const accessToken = tokenData.access_token as string;

  // Subscribe our app to the WABA's webhook events (best-effort).
  try {
    await fetch(`https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    // Non-fatal — messaging still works without webhook subscription.
  }

  await db
    .update(schema.organizations)
    .set({
      whatsappConfig: {
        enabled: true,
        phoneNumberId,
        wabaId,
        apiKey: accessToken,
        connectedVia: "embedded_signup",
      } as any,
      updatedAt: new Date(),
    })
    .where(eq(schema.organizations.id, ctx.orgId));

  await logEvent(ctx.orgId, "org_settings_updated", {
    actorId: ctx.userId,
    meta: { whatsappConnected: true, via: "embedded_signup", wabaId },
  });

  revalidatePath("/settings");
  return { ok: true };
}

export async function disconnectWhatsApp(): Promise<OrgFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "configure")) return { message: "Only admins can change org settings" };

  await db
    .update(schema.organizations)
    .set({ whatsappConfig: { enabled: false } as any, updatedAt: new Date() })
    .where(eq(schema.organizations.id, ctx.orgId));

  await logEvent(ctx.orgId, "org_settings_updated", {
    actorId: ctx.userId,
    meta: { whatsappConnected: false },
  });

  revalidatePath("/settings");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// WhatsApp message templates (whatsapp_business_management)
// ---------------------------------------------------------------------------

async function getOrgWhatsAppConfig(orgId: string) {
  const [org] = await db
    .select({ whatsappConfig: schema.organizations.whatsappConfig })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1);
  return (org?.whatsappConfig ?? null) as {
    enabled?: boolean;
    phoneNumberId?: string;
    apiKey?: string;
    wabaId?: string;
  } | null;
}

export async function getWhatsAppTemplates(): Promise<{
  ok: boolean;
  templates?: import("@/lib/whatsapp").WhatsAppTemplate[];
  message?: string;
}> {
  const ctx = await verifySession();
  if (!ctx) return { ok: false, message: "Not signed in" };

  const config = await getOrgWhatsAppConfig(ctx.orgId);
  const { listWhatsAppTemplates } = await import("@/lib/whatsapp");
  const res = await listWhatsAppTemplates(config);
  if (!res.success) return { ok: false, message: res.error };
  return { ok: true, templates: res.templates };
}

export async function createWhatsAppTemplateAction(input: {
  name: string;
  category: string;
  language: string;
  body: string;
  examples?: string[];
}): Promise<OrgFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "configure")) return { message: "Only admins can change org settings" };

  const category = ["UTILITY", "MARKETING", "AUTHENTICATION"].includes(input.category)
    ? input.category
    : "UTILITY";

  const config = await getOrgWhatsAppConfig(ctx.orgId);
  const { createWhatsAppTemplate } = await import("@/lib/whatsapp");
  const res = await createWhatsAppTemplate(config, { ...input, category });
  if (!res.success) return { message: res.error };

  await logEvent(ctx.orgId, "org_settings_updated", {
    actorId: ctx.userId,
    meta: { whatsappTemplateCreated: input.name },
  });
  return { ok: true, message: `Template "${input.name}" submitted — Meta usually approves within minutes` };
}

export async function deleteWhatsAppTemplateAction(name: string): Promise<OrgFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "configure")) return { message: "Only admins can change org settings" };

  const config = await getOrgWhatsAppConfig(ctx.orgId);
  const { deleteWhatsAppTemplate } = await import("@/lib/whatsapp");
  const res = await deleteWhatsAppTemplate(config, name);
  if (!res.success) return { message: res.error };

  await logEvent(ctx.orgId, "org_settings_updated", {
    actorId: ctx.userId,
    meta: { whatsappTemplateDeleted: name },
  });
  return { ok: true, message: `Template "${name}" deleted` };
}
