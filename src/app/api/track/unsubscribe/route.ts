import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Unsubscribe endpoint.
 * Marks the lead as unsubscribed and pauses the enrollment.
 * Shows a simple confirmation page.
 */
async function handleUnsubscribe(token: string): Promise<boolean> {
  const [enrollment] = await db
    .select()
    .from(schema.sequenceEnrollments)
    .where(eq(schema.sequenceEnrollments.unsubscribeToken, token))
    .limit(1);

  if (!enrollment) return false;

  // Mark lead as unsubscribed
  await db
    .update(schema.leads)
    .set({ unsubscribedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.leads.id, enrollment.leadId));

  // Pause the enrollment
  await db
    .update(schema.sequenceEnrollments)
    .set({
      status: "paused",
      pausedReason: "unsubscribed",
      pausedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.sequenceEnrollments.id, enrollment.id));

  // Record unsubscribe event
  await db.insert(schema.sequenceEmailEvents).values({
    orgId: enrollment.orgId,
    enrollmentId: enrollment.id,
    stepId: "00000000-0000-0000-0000-000000000000", // not step-specific
    leadId: enrollment.leadId,
    eventType: "unsubscribed",
  });

  return true;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Invalid unsubscribe link", { status: 400 });
  }

  const success = await handleUnsubscribe(token);

  const html = success
    ? `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Unsubscribed</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f0;color:#1E2A22}.card{max-width:400px;padding:40px;text-align:center}h1{font-size:24px;margin-bottom:12px}p{color:#4A5750;font-size:15px;line-height:1.6}</style></head><body><div class="card"><h1>You're unsubscribed</h1><p>You will no longer receive automated sequence emails from us. If this was a mistake, contact the sender directly.</p></div></body></html>`
    : `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Invalid Link</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f0;color:#1E2A22}.card{max-width:400px;padding:40px;text-align:center}h1{font-size:24px;margin-bottom:12px}p{color:#4A5750;font-size:15px}</style></head><body><div class="card"><h1>Invalid link</h1><p>This unsubscribe link is no longer valid.</p></div></body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}
