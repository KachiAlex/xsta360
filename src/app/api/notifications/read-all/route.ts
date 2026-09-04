import { NextResponse } from "next/server";
import { verifySession, markAllAsRead } from "@/lib/dal";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/read-all
 * Marks all notifications as read for the current user.
 */
export async function POST() {
  const ctx = await verifySession();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await markAllAsRead(ctx.orgId, ctx.userId);
  return NextResponse.json({ success: true });
}
