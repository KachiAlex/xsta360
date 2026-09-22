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

// ---------------------------------------------------------------------------
// Custom sender domain (Brevo-authenticated) — lets an org send sequence
// emails From: anything@theirdomain.com instead of the platform address.
// ---------------------------------------------------------------------------

const DOMAIN_RE = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

function domainStatus(info: { verified: boolean; authenticated: boolean }): string {
  return info.authenticated ? "authenticated" : info.verified ? "verified" : "pending";
}

/** Domains an org may never connect (they're already authenticated on the
 * shared Brevo account, so connecting them would let an org send AS us). */
function platformDomains(): string[] {
  const domains = new Set<string>();
  const fromEmail = process.env.EMAIL_FROM?.match(/@([a-z0-9.-]+\.[a-z]{2,})/i)?.[1];
  if (fromEmail) domains.add(fromEmail.toLowerCase());
  try {
    if (process.env.APP_URL) domains.add(new URL(process.env.APP_URL).hostname.toLowerCase());
  } catch {}
  return [...domains];
}

export async function connectEmailDomain(domain: string): Promise<OrgFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "configure")) return { message: "Only admins can change org settings" };

  const { brevoConfigured, createSenderDomain } = await import("@/lib/brevo");
  if (!brevoConfigured()) {
    return { message: "Custom sender domains aren't enabled on this server" };
  }

  const d = domain.trim().toLowerCase();
  if (!DOMAIN_RE.test(d)) {
    return { errors: { emailDomain: ["Enter a valid domain (e.g. yourcompany.com)"] } };
  }
  if (platformDomains().includes(d)) {
    return { message: "That domain can't be connected to a workspace" };
  }

  // One domain per org — and one org per domain.
  const [existing] = await db
    .select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.emailDomain, d))
    .limit(1);
  if (existing && existing.id !== ctx.orgId) {
    return { message: "That domain is already connected to another workspace" };
  }

  let info;
  try {
    info = await createSenderDomain(d);
  } catch (err) {
    return { message: err instanceof Error ? err.message : "Could not connect domain" };
  }

  await db
    .update(schema.organizations)
    .set({
      emailDomain: d,
      emailDomainStatus: domainStatus(info),
      emailDomainRecords: info.records as any,
      emailFromAddress: `noreply@${d}`,
      updatedAt: new Date(),
    })
    .where(eq(schema.organizations.id, ctx.orgId));

  await logEvent(ctx.orgId, "org_settings_updated", {
    actorId: ctx.userId,
    meta: { emailDomain: d },
  });

  revalidatePath("/settings");
  return {
    ok: true,
    message: "Domain connected — add the DNS records shown below, then click \"Check status\"",
  };
}

export async function checkEmailDomainStatus(): Promise<OrgFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "configure")) return { message: "Only admins can change org settings" };

  const [org] = await db
    .select({ emailDomain: schema.organizations.emailDomain })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, ctx.orgId))
    .limit(1);
  if (!org?.emailDomain) return { message: "No domain connected" };

  const { authenticateSenderDomain, getSenderDomain } = await import("@/lib/brevo");
  try {
    await authenticateSenderDomain(org.emailDomain);
  } catch {
    // Validation may fail while records propagate — the GET below still
    // reports per-record status.
  }

  let info;
  try {
    info = await getSenderDomain(org.emailDomain);
  } catch (err) {
    return { message: err instanceof Error ? err.message : "Could not check domain status" };
  }

  const status = domainStatus(info);
  await db
    .update(schema.organizations)
    .set({
      emailDomainStatus: status,
      emailDomainRecords: info.records as any,
      updatedAt: new Date(),
    })
    .where(eq(schema.organizations.id, ctx.orgId));

  revalidatePath("/settings");
  return {
    ok: status === "authenticated",
    message:
      status === "authenticated"
        ? `Domain authenticated — emails now send from ${org.emailDomain}`
        : status === "verified"
          ? "Domain verified — DKIM record still pending. Add it, then check again."
          : "DNS records not detected yet — DNS changes can take a few minutes to propagate.",
  };
}

export async function setEmailFromAddress(address: string): Promise<OrgFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "configure")) return { message: "Only admins can change org settings" };

  const [org] = await db
    .select({ emailDomain: schema.organizations.emailDomain })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, ctx.orgId))
    .limit(1);
  if (!org?.emailDomain) return { message: "Connect a sender domain first" };

  const addr = address.trim().toLowerCase();
  if (!z.string().email().safeParse(addr).success) {
    return { errors: { emailFromAddress: ["Enter a valid email address"] } };
  }
  if (!addr.endsWith(`@${org.emailDomain}`)) {
    return {
      errors: { emailFromAddress: [`Address must be on your connected domain (@${org.emailDomain})`] },
    };
  }

  await db
    .update(schema.organizations)
    .set({ emailFromAddress: addr, updatedAt: new Date() })
    .where(eq(schema.organizations.id, ctx.orgId));

  revalidatePath("/settings");
  return { ok: true, message: `Sender address set to ${addr}` };
}

export async function removeEmailDomain(): Promise<OrgFormState> {
  const ctx = await verifySession();
  if (!ctx) return { message: "Not signed in" };
  if (!can(ctx, "configure")) return { message: "Only admins can change org settings" };

  const [org] = await db
    .select({ emailDomain: schema.organizations.emailDomain })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, ctx.orgId))
    .limit(1);
  if (!org?.emailDomain) return { message: "No domain connected" };

  const { brevoConfigured, deleteSenderDomain } = await import("@/lib/brevo");
  if (brevoConfigured()) {
    try {
      await deleteSenderDomain(org.emailDomain);
    } catch {
      // Best-effort — clear locally even if Brevo already removed it.
    }
  }

  await db
    .update(schema.organizations)
    .set({
      emailDomain: null,
      emailDomainStatus: null,
      emailDomainRecords: null,
      emailFromAddress: null,
      updatedAt: new Date(),
    })
    .where(eq(schema.organizations.id, ctx.orgId));

  await logEvent(ctx.orgId, "org_settings_updated", {
    actorId: ctx.userId,
    meta: { emailDomainRemoved: org.emailDomain },
  });

  revalidatePath("/settings");
  return { ok: true, message: "Custom sender domain removed — emails send from the platform address again" };
}
