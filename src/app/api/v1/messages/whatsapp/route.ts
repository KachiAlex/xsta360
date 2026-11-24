import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, authenticateApiRequest, withIdempotency } from "@/lib/api";
import { upsertApiContact } from "@/lib/api-contacts";
import { getOrgPlan, getPlanQuota } from "@/lib/dal";
import { getOrgSendUsage, isOrgWhatsAppThrottled } from "@/lib/usage";
import {
  sendWhatsAppMessage,
  sendWhatsAppTemplateMessage,
  getWhatsAppTemplate,
  type WhatsAppConfig,
} from "@/lib/whatsapp";
import { dispatchOrgWebhook } from "@/lib/outbound-webhooks";

export const dynamic = "force-dynamic";

interface WaBody {
  to?: string; // phone or contactId
  contactId?: string;
  name?: string;
  type?: "template" | "text";
  template?: string; // approved template name
  params?: string[]; // template body params
  language?: string;
  text?: string; // free-form body — only inside the 24h service window
  consent?: boolean;
}

const DAY_MS = 24 * 3600_000;

/**
 * POST /api/v1/messages/whatsapp
 * Send a WhatsApp message. Rules enforced here, not just by Meta:
 * - consent: true is a required attestation.
 * - opted-out contacts are refused (422).
 * - free-form text only inside the 24h service window; outside it you must
 *   send an approved template.
 * - plan monthly/daily quotas + org failure-rate circuit breaker.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, "messages:send");
    const body = (await request.json()) as WaBody;

    const type = body.type ?? (body.template ? "template" : "text");
    if (!body.to && !body.contactId) {
      return NextResponse.json({ error: "Provide to (phone) or contactId" }, { status: 422 });
    }
    if (type === "template" && !body.template) {
      return NextResponse.json({ error: "template name is required for type=template" }, { status: 422 });
    }
    if (type === "text" && !body.text?.trim()) {
      return NextResponse.json({ error: "text is required for type=text" }, { status: 422 });
    }
    if (body.consent !== true) {
      return NextResponse.json(
        { error: "consent: true is required — you must attest the recipient consented to be contacted" },
        { status: 422 },
      );
    }

    const result = await withIdempotency(request, auth.orgId, async () => {
      // contactId targets an existing lead; a bare phone upserts one.
      const contactId = body.contactId ?? (/^[0-9a-f-]{36}$/i.test(body.to ?? "") ? body.to : undefined);
      let contact;
      if (contactId) {
        contact = (
          await db
            .select()
            .from(schema.leads)
            .where(and(eq(schema.leads.id, contactId), eq(schema.leads.orgId, auth.orgId)))
            .limit(1)
        )[0];
        if (!contact) return { status: 404, body: { error: "Contact not found" } };
      } else {
        ({ lead: contact } = await upsertApiContact(auth.orgId, { phone: body.to, name: body.name }));
      }

      if (contact.whatsappOptOutAt) {
        return { status: 422, body: { error: "Contact has opted out of WhatsApp" } };
      }

      const phone = contact.phone ?? body.to;
      if (!phone) return { status: 422, body: { error: "Contact has no phone number" } };

      // Org WhatsApp config.
      const [org] = await db
        .select({ name: schema.organizations.name, whatsappConfig: schema.organizations.whatsappConfig })
        .from(schema.organizations)
        .where(eq(schema.organizations.id, auth.orgId))
        .limit(1);
      const config = org?.whatsappConfig as WhatsAppConfig | null;
      if (!config?.enabled || !config.phoneNumberId || !config.apiKey) {
        return { status: 400, body: { error: "WhatsApp is not connected for this workspace" } };
      }

      // Quotas + circuit breaker.
      const [plan, usage, throttled] = await Promise.all([
        getOrgPlan(auth.orgId),
        getOrgSendUsage(auth.orgId),
        isOrgWhatsAppThrottled(auth.orgId),
      ]);
      const waMonthly = getPlanQuota(plan, "whatsapp_monthly_limit");
      const waDaily = getPlanQuota(plan, "whatsapp_daily_limit");
      if (waMonthly != null && usage.whatsappThisMonth >= waMonthly) {
        return { status: 429, body: { error: `Monthly WhatsApp quota reached (${waMonthly})` } };
      }
      if (waDaily != null && usage.whatsappToday >= waDaily) {
        return { status: 429, body: { error: `Daily WhatsApp cap reached (${waDaily}) — retry tomorrow` } };
      }
      if (throttled) {
        return {
          status: 503,
          body: { error: "WhatsApp sends temporarily suspended — high failure rate in the last 24h. Check your WABA quality in Meta Business Suite." },
        };
      }

      // Free-form only inside the 24h service window.
      const withinWindow =
        contact.lastWhatsappInboundAt != null &&
        Date.now() - contact.lastWhatsappInboundAt.getTime() < DAY_MS;

      let sendResult: { success: boolean; error?: string; wamid?: string };
      if (type === "text") {
        if (!withinWindow) {
          return {
            status: 422,
            body: { error: "Contact is outside the 24-hour service window — send an approved template instead" },
          };
        }
        sendResult = await sendWhatsAppMessage(config, phone, body.text!.trim());
      } else {
        const tpl = await getWhatsAppTemplate(config, body.template!);
        if (!tpl.success) {
          return { status: 502, body: { error: `Template lookup failed: ${tpl.error}` } };
        }
        if (tpl.status !== "APPROVED") {
          return { status: 422, body: { error: `Template "${body.template}" is not approved (status: ${tpl.status ?? "missing"})` } };
        }
        sendResult = await sendWhatsAppTemplateMessage(
          config,
          phone,
          body.template!,
          (body.params ?? []).map(String),
        );
      }

      const [row] = await db
        .insert(schema.reminders)
        .values({
          orgId: auth.orgId,
          leadId: contact.id,
          assigneeId: contact.assigneeId,
          dueAt: new Date(),
          note: `[API] WhatsApp ${type} to ${phone}`,
          status: sendResult.success ? "sent" : "failed",
          sentAt: sendResult.success ? new Date() : null,
          channel: "whatsapp",
          lastError: sendResult.success ? null : (sendResult.error ?? "send failed"),
          wamid: sendResult.wamid ?? null,
          deliveryStatus: sendResult.success ? "sent" : null,
        })
        .returning({ id: schema.reminders.id });

      if (sendResult.success) {
        void dispatchOrgWebhook(auth.orgId, "message.sent", {
          channel: "whatsapp",
          messageId: row.id,
          wamid: sendResult.wamid,
          to: phone,
          contactId: contact.id,
        }).catch(() => {});
        return { status: 200, body: { id: row.id, wamid: sendResult.wamid, status: "sent" } };
      }
      return { status: 502, body: { error: sendResult.error ?? "WhatsApp send failed", id: row.id } };
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/v1/messages/whatsapp failed:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
