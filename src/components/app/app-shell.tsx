import { requireAuth, isSubscriptionBlocked, getOrgBilling } from "@/lib/dal";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db, schema } from "@/db";
import { eq, and, lte } from "drizzle-orm";
import { Sidebar } from "./sidebar";
import { BottomNav } from "./bottom-nav";
import { Footer } from "./footer";
import { LivePoller } from "./live-poller";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export async function AppShell({
  children,
  enforceSubscription = true,
}: {
  children: React.ReactNode;
  enforceSubscription?: boolean;
}) {
  const ctx = await requireAuth();

  // Expired trial / lapsed payment: lock the app until billing is resolved.
  // The /billing route lives in its own route group that passes
  // enforceSubscription={false} so users can still reach the payment page.
  if (enforceSubscription && !ctx.isSuperadmin && (await isSubscriptionBlocked(ctx.orgId))) {
    redirect("/billing");
  }

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

  // Trial countdown banner — all members see days left; admins get the pay link.
  const billing = await getOrgBilling(ctx.orgId);
  const showTrialBanner =
    billing.plan.status === "trialing" &&
    billing.daysLeftInTrial !== null &&
    billing.daysLeftInTrial >= 0;

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
      <div className="app-main flex-1 flex flex-col min-w-0">
        {showTrialBanner && (
          <div className="bg-amber/10 border-b border-amber/20 px-4 py-2 text-center">
            <span className="text-xs text-[#9c6014]">
              Free trial —{" "}
              <span className="font-semibold">
                {billing.daysLeftInTrial} day{billing.daysLeftInTrial !== 1 ? "s" : ""} left
              </span>
              .{" "}
              {ctx.role === "admin" ? (
                <>
                  <Link href="/billing" className="underline font-semibold hover:text-ink">
                    Add a payment method
                  </Link>{" "}
                  to keep access after{" "}
                  {billing.trialEndsAt?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}.
                </>
              ) : (
                <>Ask your workspace admin to add a payment method to keep access.</>
              )}
            </span>
          </div>
        )}
        <div className="flex-1">{children}</div>
        <Footer />
      </div>
      <BottomNav todayCount={todaysReminders.length} />
      <LivePoller />
    </div>
  );
}
