import { requireAuth } from "@/lib/dal";
import { db, schema } from "@/db";
import { eq, and, lte } from "drizzle-orm";
import { Sidebar } from "./sidebar";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const ctx = await requireAuth();

  const [user] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, ctx.userId))
    .limit(1);
  const [org] = await db
    .select({ name: schema.organizations.name })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, ctx.orgId))
    .limit(1);

  // Today's follow-up count for the sidebar badge: pending reminders due today
  // or overdue, assigned to the current user.
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const todaysReminders = await db
    .select({ id: schema.reminders.id })
    .from(schema.reminders)
    .where(
      and(
        eq(schema.reminders.orgId, ctx.orgId),
        eq(schema.reminders.assigneeId, ctx.userId),
        eq(schema.reminders.status, "pending"),
        lte(schema.reminders.dueAt, endOfDay),
      ),
    );

  const name = user?.name ?? "User";

  return (
    <div className="flex min-h-screen">
      <Sidebar
        orgName={org?.name ?? "Organization"}
        userName={name}
        userInitials={initials(name)}
        role={ctx.role}
        todayCount={todaysReminders.length}
      />
      <div className="flex-1 flex flex-col min-w-0 pt-12 md:pt-0">{children}</div>
    </div>
  );
}
