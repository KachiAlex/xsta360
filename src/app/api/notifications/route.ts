import { NextResponse } from "next/server";
import { verifySession, getUnreadCount, getUserNotifications } from "@/lib/dal";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications
 * Returns notifications for the current user + unread count.
 */
export async function GET(request: Request) {
  const ctx = await verifySession();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unreadOnly") === "true";

  const [notifications, unreadCount] = await Promise.all([
    getUserNotifications(ctx.orgId, ctx.userId, { limit: 30, unreadOnly }),
    getUnreadCount(ctx.orgId, ctx.userId),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}
