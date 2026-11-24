"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/db";
import { requireRole } from "@/lib/dal";
import { API_SCOPES, generateApiKey, generateWebhookSecret } from "@/lib/api";
import { ORG_WEBHOOK_EVENTS, validateWebhookUrl } from "@/lib/outbound-webhooks";

/**
 * API key + outbound webhook management — org admins only.
 * Secrets are returned once at creation and never stored in plaintext.
 */

export async function createApiKey(input: { name: string; scopes: string[] }) {
  const ctx = await requireRole("admin");
  const name = input.name?.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Give the key a name" };

  const scopes = (input.scopes ?? []).filter((s) =>
    (API_SCOPES as readonly string[]).includes(s),
  );
  if (scopes.length === 0) return { ok: false, error: "Pick at least one scope" };

  const { key, prefix, keyHash } = generateApiKey();
  await db.insert(schema.apiKeys).values({
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    name,
    prefix,
    keyHash,
    scopes,
  });
  revalidatePath("/settings");
  return { ok: true, key };
}

export async function revokeApiKey(id: string) {
  const ctx = await requireRole("admin");
  await db
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.apiKeys.id, id), eq(schema.apiKeys.orgId, ctx.orgId)));
  revalidatePath("/settings");
  return { ok: true };
}

export async function createWebhook(input: { url: string; events: string[] }) {
  const ctx = await requireRole("admin");
  const url = input.url?.trim();
  const check = validateWebhookUrl(url ?? "");
  if (!check.ok) return { ok: false, error: check.error };

  const events = (input.events ?? []).filter((e) =>
    (ORG_WEBHOOK_EVENTS as string[]).includes(e),
  );
  if (events.length === 0) return { ok: false, error: "Pick at least one event" };

  const secret = generateWebhookSecret();
  await db.insert(schema.orgWebhooks).values({
    orgId: ctx.orgId,
    createdBy: ctx.userId,
    url: url!,
    secret,
    events,
  });
  revalidatePath("/settings");
  return { ok: true, secret };
}

export async function setWebhookActive(id: string, active: boolean) {
  const ctx = await requireRole("admin");
  await db
    .update(schema.orgWebhooks)
    .set({ active })
    .where(and(eq(schema.orgWebhooks.id, id), eq(schema.orgWebhooks.orgId, ctx.orgId)));
  revalidatePath("/settings");
  return { ok: true };
}

export async function deleteWebhook(id: string) {
  const ctx = await requireRole("admin");
  await db
    .delete(schema.orgWebhooks)
    .where(and(eq(schema.orgWebhooks.id, id), eq(schema.orgWebhooks.orgId, ctx.orgId)));
  revalidatePath("/settings");
  return { ok: true };
}
