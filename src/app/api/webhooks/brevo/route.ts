import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Brevo webhook endpoint for email events.
 * Handles: delivered, bounce, soft_bounce, reply, spam, blocked
 *
 * Brevo sends POST with event data including the message ID,
 * which we use to find the corresponding sequence_email_events "sent" record.
 *
 * Configure in Brevo dashboard:
 *   URL: https://xsta360.com.ng/api/webhooks/brevo
 *   Events: delivered, hard_bounce, soft_bounce, spam, blocked, reply
 */
export async function POST(request: Request) {
  // Verify webhook secret if configured
  const webhookSecret = process.env.BREVO_WEBHOOK_SECRET;
  if (webhookSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${webhookSecret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // Brevo sends either a single event or an array.
  const events = Array.isArray(payload) ? payload : [payload];
  const results: string[] = [];

  for (const evt of events) {
    const eventType = evt.event || evt.type;
    const messageId = evt.messageId || evt["message-id"] || evt.message_id;
    const email = evt.email || evt.recipient;
    const reason = evt.reason || evt.subject || "";

    if (!eventType) continue;

    try {
      // Find the "sent" event by looking up the lead by email
      if (email) {
        const [lead] = await db
          .select({ id: schema.leads.id, orgId: schema.leads.orgId })
          .from(schema.leads)
          .where(eq(schema.leads.email, email))
          .limit(1);

        if (lead) {
          // Find the most recent "sent" event for this lead
          const [sentEvent] = await db
            .select()
            .from(schema.sequenceEmailEvents)
            .where(eq(schema.sequenceEmailEvents.leadId, lead.id))
            .limit(1);

          if (sentEvent) {
            // Map Brevo event types to our event types
            const mappedType = mapBrevoEvent(eventType);

            if (mappedType) {
              await db.insert(schema.sequenceEmailEvents).values({
                orgId: lead.orgId,
                enrollmentId: sentEvent.enrollmentId,
                stepId: sentEvent.stepId,
                leadId: lead.id,
                eventType: mappedType,
                variant: sentEvent.variant,
              });
            }

            // Handle bounce: pause enrollment
            if (mappedType === "bounced") {
              await db
                .update(schema.sequenceEnrollments)
                .set({
                  status: "paused",
                  pausedReason: "bounce",
                  pausedAt: new Date(),
                  bouncedAt: new Date(),
                  bounceReason: reason,
                  updatedAt: new Date(),
                })
                .where(eq(schema.sequenceEnrollments.id, sentEvent.enrollmentId));
            }

            // Handle reply: pause enrollment
            if (mappedType === "replied") {
              await db
                .update(schema.sequenceEnrollments)
                .set({
                  status: "paused",
                  pausedReason: "reply",
                  pausedAt: new Date(),
                  repliedAt: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(schema.sequenceEnrollments.id, sentEvent.enrollmentId));
            }

            results.push(`processed:${mappedType}`);
          }
        }
      }
    } catch (err) {
      results.push(`error:${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  return Response.json({ processed: results.length, results });
}

function mapBrevoEvent(brevoEvent: string): string | null {
  const map: Record<string, string> = {
    delivered: "delivered",
    hard_bounce: "bounced",
    soft_bounce: "bounced",
    bounce: "bounced",
    spam: "unsubscribed",
    blocked: "bounced",
    reply: "replied",
    opened: "opened",
    clicked: "clicked",
    unsubscribed: "unsubscribed",
  };
  return map[brevoEvent.toLowerCase()] || null;
}
