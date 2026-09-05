import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// 1x1 transparent GIF pixel
const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

/**
 * Email open tracking endpoint.
 * Returns a 1x1 transparent pixel and records the open event.
 */
export async function GET(request: Request) {
  // Rate limit: 60 opens/min per IP (pixels are loaded in bulk by email clients)
  const rl = rateLimit(clientKey(request, "open"), 60, 60_000);
  if (!rl.allowed) {
    return new Response(TRACKING_PIXEL, {
      status: 429,
      headers: {
        "Content-Type": "image/gif",
        "Retry-After": String(rl.retryAfterSeconds),
      },
    });
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get("e");

  if (eventId) {
    try {
      // Find the original email event to get enrollment/step/lead IDs.
      const [event] = await db
        .select()
        .from(schema.sequenceEmailEvents)
        .where(eq(schema.sequenceEmailEvents.id, eventId))
        .limit(1);

      if (event && event.eventType === "sent") {
        // Insert open event (we allow multiple opens for analytics)
        await db.insert(schema.sequenceEmailEvents).values({
          orgId: event.orgId,
          enrollmentId: event.enrollmentId,
          stepId: event.stepId,
          leadId: event.leadId,
          eventType: "opened",
          variant: event.variant,
          userAgent: request.headers.get("user-agent") || null,
          ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0] || null,
        });
      }
    } catch {
      // Silently fail — don't break the pixel
    }
  }

  return new Response(TRACKING_PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
  });
}
