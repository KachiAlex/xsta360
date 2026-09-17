import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * DB-backed rate limiter. Uses an upsert to atomically increment or reset
 * the bucket. Multi-instance safe.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const resetAt = new Date(now + windowMs);
  // Convert Dates to ISO strings — the postgres driver can't serialize Date objects.
  const nowISO = new Date(now).toISOString();
  const resetAtISO = resetAt.toISOString();

  // Atomic upsert: insert or update the bucket.
  const [row] = await db
    .insert(schema.rateLimitBuckets)
    .values({ key, count: 1, resetAt })
    .onConflictDoUpdate({
      target: schema.rateLimitBuckets.key,
      set: {
        count: sql`CASE WHEN ${schema.rateLimitBuckets.resetAt} <= ${nowISO}::timestamptz THEN 1 ELSE ${schema.rateLimitBuckets.count} + 1 END`,
        resetAt: sql`CASE WHEN ${schema.rateLimitBuckets.resetAt} <= ${nowISO}::timestamptz THEN ${resetAtISO}::timestamptz ELSE ${schema.rateLimitBuckets.resetAt} END`,
      },
    })
    .returning({ count: schema.rateLimitBuckets.count, resetAt: schema.rateLimitBuckets.resetAt });

  const currentCount = row?.count ?? 1;
  const bucketResetAt = row?.resetAt ?? resetAt;

  if (currentCount > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucketResetAt.getTime() - now) / 1000),
    };
  }

  return {
    allowed: true,
    remaining: limit - currentCount,
    retryAfterSeconds: 0,
  };
}

/** Extract a client identifier from the request (IP or fallback). */
export function clientKey(request: Request, prefix: string): string {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
  return `${prefix}:${ip}`;
}
