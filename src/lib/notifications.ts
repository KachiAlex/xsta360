import "server-only";
import { db, schema } from "@/db";
import { eq, and, isNull, desc, sql, or } from "drizzle-orm";

export type NotificationType =
  | "lead_assigned"
  | "payment_success"
  | "payment_failed"
  | "trial_ending"
  | "card_lead"
  | "card_saved"
  | "sequence_step"
  | "team_invite";

/**
 * Create an in-app notification for a specific user or broadcast to all org members.
 */
export async function createNotification(params: {
  orgId: string;
  userId?: string | null;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}) {
  await db.insert(schema.notifications).values({
    orgId: params.orgId,
    userId: params.userId ?? null,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    link: params.link ?? null,
  });
}

/**
 * Create notifications for all members of an org (broadcast).
 */
export async function broadcastToOrg(params: {
  orgId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}) {
  const members = await db
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .where(eq(schema.memberships.orgId, params.orgId));

  if (members.length === 0) return;

  await db.insert(schema.notifications).values(
    members.map((m) => ({
      orgId: params.orgId,
      userId: m.userId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      link: params.link ?? null,
    })),
  );
}

/**
 * Get notifications for a user — both personal and broadcast (userId is null).
 */
export async function getUserNotifications(
  orgId: string,
  userId: string,
  opts?: { limit?: number; unreadOnly?: boolean },
) {
  const limit = opts?.limit ?? 20;
  const conditions = [
    eq(schema.notifications.orgId, orgId),
    or(
      eq(schema.notifications.userId, userId),
      isNull(schema.notifications.userId),
    ),
  ];

  if (opts?.unreadOnly) {
    conditions.push(isNull(schema.notifications.readAt));
  }

  return db
    .select()
    .from(schema.notifications)
    .where(and(...conditions))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
}

/**
 * Get unread notification count for a user.
 */
export async function getUnreadCount(orgId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.orgId, orgId),
        or(
          eq(schema.notifications.userId, userId),
          isNull(schema.notifications.userId),
        ),
        isNull(schema.notifications.readAt),
      ),
    );
  return row?.count ?? 0;
}

/**
 * Mark a notification as read.
 */
export async function markAsRead(notificationId: string, userId: string) {
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.id, notificationId),
        // Ensure the user owns this notification (or it's a broadcast).
        or(
          eq(schema.notifications.userId, userId),
          isNull(schema.notifications.userId),
        ),
      ),
    );
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(orgId: string, userId: string) {
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.orgId, orgId),
        or(
          eq(schema.notifications.userId, userId),
          isNull(schema.notifications.userId),
        ),
        isNull(schema.notifications.readAt),
      ),
    );
}
