import { NextRequest, NextResponse } from "next/server";
import { ApiError, authenticateApiRequest, withIdempotency } from "@/lib/api";
import { upsertApiContact, findApiLead, type ApiContactInput } from "@/lib/api-contacts";
import { enrollLeadInSequence } from "@/lib/sequences";

export const dynamic = "force-dynamic";

interface EnrollBody {
  contactId?: string;
  contact?: ApiContactInput; // upserted then enrolled
}

/**
 * POST /api/v1/sequences/:id/enroll
 * { "contactId": "…" } or { "contact": { "name", "email", "phone", "optIn": … } }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateApiRequest(request, "sequences:enroll");
    const { id: sequenceId } = await params;
    const body = (await request.json()) as EnrollBody;

    if (!body.contactId && !body.contact) {
      return NextResponse.json({ error: "Provide contactId or contact" }, { status: 422 });
    }

    const result = await withIdempotency(request, auth.orgId, async () => {
      let leadId = body.contactId;
      if (leadId) {
        const lead = await findApiLead(auth.orgId, { contactId: leadId });
        if (!lead) return { status: 404, body: { error: "Contact not found" } };
      } else {
        const { lead } = await upsertApiContact(auth.orgId, body.contact!);
        leadId = lead.id;
      }

      const res = await enrollLeadInSequence(auth.orgId, leadId!, sequenceId, auth.createdBy);
      if (!res.ok) return { status: 422, body: { error: res.message ?? "Enrollment failed" } };
      return { status: 200, body: { enrolled: true, contactId: leadId, sequenceId } };
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/v1/sequences/:id/enroll failed:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
