import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySession } from "@/lib/dal";
import { getLeadTimeline } from "@/lib/dashboard";

export async function GET(request: NextRequest) {
  const ctx = await verifySession();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const leadId = request.nextUrl.searchParams.get("leadId");
  if (!leadId || !z.string().uuid().safeParse(leadId).success) {
    return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
  }

  try {
    const timeline = await getLeadTimeline(ctx.orgId, leadId);

    return NextResponse.json({
      timeline: timeline.map((e) => ({
        id: e.id,
        type: e.type,
        body: e.body,
        occurredAt: e.occurredAt.toISOString(),
        authorName: e.authorName,
      })),
    });
  } catch (err) {
    console.error("Timeline fetch error:", err);
    return NextResponse.json({ error: "Failed to load timeline" }, { status: 500 });
  }
}
