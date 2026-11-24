import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "crypto";
import { db, schema } from "@/db";
import { rateLimit } from "@/lib/rate-limit";
import { getOrgPlan } from "@/lib/dal";

/**
 * Public REST API authentication + write-path helpers.
 *
 * Keys: `xsta_live_<random>` — the DB stores only the sha256 hash and a
 * short display prefix. Keys are org-scoped, scope-limited, and revocable.
 * API access is a plan-gated feature: plans need features.api_access = true.
 */

export const API_SCOPES = [
  "contacts:write",
  "messages:send",
  "sequences:enroll",
  "read",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export interface ApiAuth {
  orgId: string;
  keyId: string;
  createdBy: string | null;
  scopes: string[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function generateApiKey(): { key: string; prefix: string; keyHash: string } {
  const key = `xsta_live_${randomBytes(24).toString("hex")}`;
  return { key, prefix: key.slice(0, 17), keyHash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Verify `Authorization: Bearer xsta_live_…` (or X-Api-Key), check the scope,
 * plan feature gate, and per-key rate limit. Throws ApiError on failure.
 */
export async function authenticateApiRequest(
  request: Request,
  requiredScope: ApiScope,
  ratePerMinute = 60,
): Promise<ApiAuth> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ")
    ? auth.slice(7).trim()
    : (request.headers.get("x-api-key") ?? "").trim();
  if (!token.startsWith("xsta_live_")) {
    throw new ApiError(401, "Missing or invalid API key");
  }

  const [row] = await db
    .select({
      id: schema.apiKeys.id,
      orgId: schema.apiKeys.orgId,
      createdBy: schema.apiKeys.createdBy,
      scopes: schema.apiKeys.scopes,
    })
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.keyHash, hashApiKey(token)), isNull(schema.apiKeys.revokedAt)))
    .limit(1);
  if (!row) throw new ApiError(401, "Invalid or revoked API key");

  const scopes = (row.scopes as string[]) ?? [];
  if (!scopes.includes(requiredScope)) {
    throw new ApiError(403, `This key lacks the "${requiredScope}" scope`);
  }

  // Plan gate — api_access must be explicitly enabled on the org's plan.
  const plan = await getOrgPlan(row.orgId);
  if ((plan.features as Record<string, unknown>)?.api_access !== true) {
    throw new ApiError(403, "API access is not enabled on your plan — upgrade to use it");
  }

  const rl = await rateLimit(`apikey:${row.id}`, ratePerMinute, 60_000);
  if (!rl.allowed) {
    throw new ApiError(429, `Rate limit exceeded — retry in ${rl.retryAfterSeconds}s`);
  }

  // Best-effort usage stamp — don't block the request on it.
  void db
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiKeys.id, row.id))
    .catch(() => {});

  return { orgId: row.orgId, keyId: row.id, createdBy: row.createdBy, scopes };
}

/**
 * Replay-safe wrapper for POST endpoints. If the request carries an
 * `Idempotency-Key` header we've already answered, the stored response is
 * returned instead of re-running the handler — prevents double sends when
 * e-commerce platforms retry webhooks.
 */
export async function withIdempotency<T extends { status: number; body: unknown }>(
  request: Request,
  orgId: string,
  handler: () => Promise<T>,
): Promise<T> {
  const key = request.headers.get("idempotency-key")?.slice(0, 200);
  if (!key) return handler();

  const [existing] = await db
    .select({ status: schema.apiIdempotencyKeys.responseStatus, body: schema.apiIdempotencyKeys.responseBody })
    .from(schema.apiIdempotencyKeys)
    .where(and(eq(schema.apiIdempotencyKeys.orgId, orgId), eq(schema.apiIdempotencyKeys.key, key)))
    .limit(1);
  if (existing) return { status: existing.status, body: existing.body } as T;

  const result = await handler();

  // Store the answer; on a concurrent insert conflict, re-read the winner's.
  try {
    await db.insert(schema.apiIdempotencyKeys).values({
      orgId,
      key,
      responseStatus: result.status,
      responseBody: result.body,
    });
  } catch {
    const [race] = await db
      .select({ status: schema.apiIdempotencyKeys.responseStatus, body: schema.apiIdempotencyKeys.responseBody })
      .from(schema.apiIdempotencyKeys)
      .where(and(eq(schema.apiIdempotencyKeys.orgId, orgId), eq(schema.apiIdempotencyKeys.key, key)))
      .limit(1);
    if (race) return { status: race.status, body: race.body } as T;
  }
  return result;
}

/** Generate an outbound-webhook signing secret. */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(24).toString("hex")}`;
}

export function newId(): string {
  return randomUUID();
}

/** Purge idempotency records older than 24h — called from the cron sweep. */
export async function pruneIdempotencyKeys(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
  const res = await db.execute(
    sql`DELETE FROM api_idempotency_keys WHERE created_at < ${cutoff}::timestamptz`,
  );
  return (res as { rowCount?: number }).rowCount ?? 0;
}
