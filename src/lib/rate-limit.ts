/**
 * Simple in-memory rate limiter for public endpoints.
 * Per-process (per-container) sliding window — good enough for a single
 * instance. For multi-instance deployments, swap to Redis/Upstash.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Periodically purge expired buckets so the map doesn't grow forever.
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count++;
  return { allowed: true, remaining: limit - bucket.count, retryAfterSeconds: 0 };
}

/** Extract a client identifier from the request (IP or fallback). */
export function clientKey(request: Request, prefix: string): string {
  const fwd = request.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
  return `${prefix}:${ip}`;
}
