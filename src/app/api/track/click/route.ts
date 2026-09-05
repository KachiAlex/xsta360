import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Email click tracking endpoint.
 * Records the click event and redirects to the original URL.
 */
export async function GET(request: Request) {
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

  // Redirect to original URL (or home if missing)
  if (originalUrl) {
    return Response.redirect(originalUrl, 302);
  }
  return Response.redirect(new URL("/", request.url), 302);
}
