import { NextRequest, NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { db, schema } from "@/db";
import { ApiError, authenticateApiRequest } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/messages/:id
 * Delivery state for a send — accepts our reminder id or a Meta wamid.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authenticateApiRequest(request, "read");
    const { id } = await params;

    const [row] = await db
      .select({
        id: schema.reminders.id,
        leadId: schema.reminders.leadId,
        channel: schema.reminders.channel,
        status: schema.reminders.status,
        deliveryStatus: schema.reminders.deliveryStatus,
        lastError: schema.reminders.lastError,
        wamid: schema.reminders.wamid,
        sentAt: schema.reminders.sentAt,
        deliveredAt: schema.reminders.deliveredAt,
        createdAt: schema.reminders.createdAt,
      })
      .from(schema.reminders)
      .where(
        and(
          eq(schema.reminders.orgId, auth.orgId),
          or(eq(schema.reminders.id, id), eq(schema.reminders.wamid, id)),
        ),
      )
      .limit(1);

    if (!row) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    return NextResponse.json({
      id: row.id,
      channel: row.channel ?? "email",
      contactId: row.leadId,
      status: row.deliveryStatus ?? row.status,
      lastError: row.lastError,
      wamid: row.wamid,
      sentAt: row.sentAt,
      deliveredAt: row.deliveredAt,
    });
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/v1/messages/:id failed:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
