import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, authenticateApiRequest, withIdempotency } from "@/lib/api";
import { upsertApiContact } from "@/lib/api-contacts";
import { getOrgPlan, getPlanQuota } from "@/lib/dal";
import { getOrgSendUsage } from "@/lib/usage";
import { sendMail } from "@/lib/email";
import { buildEmailHtml } from "@/lib/message-format";
import { dispatchOrgWebhook } from "@/lib/outbound-webhooks";

export const dynamic = "force-dynamic";

interface EmailBody {
  to?: string; // email address or contactId
  subject?: string;
  html?: string;
  text?: string;
  consent?: boolean;
}

/**
 * POST /api/v1/messages/email
 * Send a one-off email. `consent: true` is a required attestation that the
 * recipient consented to be contacted — it's recorded for audit.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, "messages:send");
    const body = (await request.json()) as EmailBody;

    if (!body.to) return NextResponse.json({ error: "to is required" }, { status: 422 });
    if (!body.subject?.trim()) return NextResponse.json({ error: "subject is required" }, { status: 422 });
    if (!body.html && !body.text) return NextResponse.json({ error: "Provide html or text" }, { status: 422 });
    if (body.consent !== true) {
      return NextResponse.json(
        { error: "consent: true is required — you must attest the recipient consented to be contacted" },
        { status: 422 },
      );
    }

    const result = await withIdempotency(request, auth.orgId, async () => {
      // contactId targets an existing lead; a bare email upserts one.
      const isUuid = /^[0-9a-f-]{36}$/i.test(body.to!);
      let lead;
      if (isUuid) {
        lead = (
          await db
            .select()
            .from(schema.leads)
            .where(and(eq(schema.leads.id, body.to!), eq(schema.leads.orgId, auth.orgId)))
            .limit(1)
        )[0];
        if (!lead) return { status: 404, body: { error: "Contact not found" } };
      } else {
        ({ lead } = await upsertApiContact(auth.orgId, { email: body.to }));
      }
      const toAddress = lead.email ?? (isUuid ? null : body.to!.trim());
      if (!toAddress) {
        return { status: 422, body: { error: "Contact has no email address" } };
      }
      if (lead.unsubscribedAt) {
        return { status: 422, body: { error: "Contact has unsubscribed from emails" } };
      }

      // Quota: monthly email allowance.
      const [plan, usage] = await Promise.all([getOrgPlan(auth.orgId), getOrgSendUsage(auth.orgId)]);
      const emailLimit = getPlanQuota(plan, "email_monthly_limit");
      if (emailLimit != null && usage.emailsThisMonth >= emailLimit) {
        return { status: 429, body: { error: `Monthly email quota reached (${emailLimit})` } };
      }

      const [org] = await db
        .select({ name: schema.organizations.name, replyToEmail: schema.organizations.replyToEmail, emailDomainStatus: schema.organizations.emailDomainStatus, emailFromAddress: schema.organizations.emailFromAddress })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, auth.orgId))
        .limit(1);

      const html = body.html ?? buildEmailHtml(body.text!, org?.name ?? "");
      const customFrom =
        org?.emailDomainStatus === "authenticated" && org.emailFromAddress
          ? org.emailFromAddress
          : undefined;

      try {
        await sendMail(toAddress, body.subject!.trim(), html, {
          senderName: org?.name,
          replyTo: org?.replyToEmail || undefined,
          fromEmail: customFrom,
        });
      } catch (e) {
        return { status: 502, body: { error: `Email send failed: ${e instanceof Error ? e.message : "unknown"}` } };
      }

      const [row] = await db
        .insert(schema.reminders)
        .values({
          orgId: auth.orgId,
          leadId: lead.id,
          assigneeId: lead.assigneeId,
          dueAt: new Date(),
          note: `[API] Email: ${body.subject!.trim().slice(0, 200)}`,
          status: "sent",
          sentAt: new Date(),
          channel: "email",
        })
        .returning({ id: schema.reminders.id });

      void dispatchOrgWebhook(auth.orgId, "message.sent", {
        channel: "email",
        messageId: row.id,
        to: toAddress,
        contactId: lead.id,
      }).catch(() => {});

      return { status: 200, body: { id: row.id, status: "sent", to: toAddress } };
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/v1/messages/email failed:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

