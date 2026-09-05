import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Validate that a URL is safe to redirect to.
 * Only allows http/https schemes to prevent javascript: or data: redirects.
 */
function isSafeRedirectUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Email click tracking endpoint.
 * Records the click event and redirects to the original URL.
 */
export async function GET(request: Request) {
  // Rate limit: 30 clicks/min per IP
  const rl = rateLimit(clientKey(request, "click"), 30, 60_000);
  if (!rl.allowed) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfterSeconds) },
    });
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get("e");
  const originalUrl = url.searchParams.get("u");

  if (eventId) {
    try {
      const [event] = await db
        .select()
        .from(schema.sequenceEmailEvents)
        .where(eq(schema.sequenceEmailEvents.id, eventId))
        .limit(1);

      if (event && event.eventType === "sent") {
        await db.insert(schema.sequenceEmailEvents).values({
          orgId: event.orgId,
          enrollmentId: event.enrollmentId,
          stepId: event.stepId,
          leadId: event.leadId,
          eventType: "clicked",
          url: originalUrl || null,
          variant: event.variant,
          userAgent: request.headers.get("user-agent") || null,
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0] || null,
        });
      }
    } catch {
      // Silently fail — still redirect
    }
  }

  // Redirect to original URL if it's safe, otherwise home
  if (originalUrl && isSafeRedirectUrl(originalUrl)) {
    return Response.redirect(originalUrl, 302);
  }
  return Response.redirect(new URL("/", request.url), 302);
}
