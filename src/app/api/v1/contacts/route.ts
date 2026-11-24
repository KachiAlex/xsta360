import { NextRequest, NextResponse } from "next/server";
import { ApiError, authenticateApiRequest, withIdempotency } from "@/lib/api";
import { upsertApiContact, type ApiContactInput } from "@/lib/api-contacts";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/contacts
 * Upsert a contact (matched by email, then phone). Attach consent evidence:
 *   { "optIn": { "whatsapp": { "source": "woocommerce_checkout", "at": "…" } } }
 *   { "optOut": { "whatsapp": true, "email": true } }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiRequest(request, "contacts:write");
    const input = (await request.json()) as ApiContactInput;

    if (!input.email && !input.phone) {
      return NextResponse.json({ error: "Provide at least an email or a phone" }, { status: 422 });
    }

    const result = await withIdempotency(request, auth.orgId, async () => {
      const { lead, created } = await upsertApiContact(auth.orgId, input);
      return {
        status: created ? 201 : 200,
        body: {
          id: lead.id,
          created,
          whatsappOptInAt: lead.whatsappOptInAt,
          whatsappOptOutAt: lead.whatsappOptOutAt,
          unsubscribedAt: lead.unsubscribedAt,
        },
      };
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/v1/contacts failed:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
