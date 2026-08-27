import { NextRequest, NextResponse } from "next/server";
import { getCurrentPayload } from "@/lib/session";
import { getLeadTimeline } from "@/lib/dashboard";

export async function GET(request: NextRequest) {
  const payload = await getCurrentPayload();
  if (!payload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leadId = request.nextUrl.searchParams.get("leadId");
  if (!leadId) {
    return NextResponse.json({ error: "leadId required" }, { status: 400 });
  }

  const timeline = await getLeadTimeline(payload.orgId, leadId);

  return NextResponse.json({
    timeline: timeline.map((e) => ({
      id: e.id,
      type: e.type,
      body: e.body,
      occurredAt: e.occurredAt.toISOString(),
      authorName: e.authorName,
    })),
  });
}
