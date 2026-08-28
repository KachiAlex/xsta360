import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { eq, count } from "drizzle-orm";
import { Card } from "@/components/admin/card";
import { ManageSubscriptionForm } from "@/components/admin/manage-subscription-form";
import { SuspendOrgForm } from "@/components/admin/suspend-org-form";
import { getOrgBilling } from "@/lib/dal";

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [org] = await db
    .select()
    .from(schema.organizations)
    .where(eq(schema.organizations.id, id))
    .limit(1);
  if (!org) notFound();

  const billing = await getOrgBilling(id);

  const members = await db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.memberships.role,
      suspendedAt: schema.users.suspendedAt,
      createdAt: schema.memberships.createdAt,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.orgId, id))
    .orderBy(schema.memberships.createdAt);

  const [sub] = await db
    .select({
      id: schema.subscriptions.id,
      planId: schema.subscriptions.planId,
      status: schema.subscriptions.status,
      trialEndsAt: schema.subscriptions.trialEndsAt,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
      canceledAt: schema.subscriptions.canceledAt,
      paystackAuthorizationCode: schema.subscriptions.paystackAuthorizationCode,
      paystackCustomerEmail: schema.subscriptions.paystackCustomerEmail,
      lastPaymentAt: schema.subscriptions.lastPaymentAt,
      lastPaymentAmount: schema.subscriptions.lastPaymentAmount,
      lastPaymentReference: schema.subscriptions.lastPaymentReference,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.orgId, id))
    .limit(1);

  const plans = await db
    .select({ id: schema.plans.id, name: schema.plans.name })
    .from(schema.plans)
    .where(eq(schema.plans.active, true))
    .orderBy(schema.plans.position);

  const planName = plans.find((p) => p.id === sub?.planId)?.name ?? "Free";

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/orgs" className="text-sm text-ink-soft hover:text-ink mb-2 inline-block">
          ← Back to orgs
        </Link>
        <h1 className="font-mono text-xl sm:text-2xl m-0 mb-1">{org.name}</h1>
        <p className="text-sm text-ink-soft font-mono m-0">{org.id}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Members" value={billing.memberCount} />
        <Card label="Plan" value={planName} />
        <Card
          label="Status"
          value={billing.plan.status ?? "none"}
          tone={billing.plan.status === "active" ? "register" : billing.plan.status === "trialing" ? "default" : "stamp"}
        />
        <Card
          label="Monthly bill"
          value={`${billing.plan.currency}${billing.monthlyAmount.toLocaleString()}`}
          tone="register"
        />
      </div>

      {/* Billing breakdown */}
      <div className="bg-panel border border-rule rounded-md">
        <div className="px-4 py-3 border-b border-rule">
          <h2 className="font-mono text-sm uppercase tracking-wider m-0">Billing breakdown</h2>
        </div>
        <div className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-ink-soft">Plan</span>
            <span className="font-semibold">{billing.plan.planName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink-soft">Base (workspace admin)</span>
            <span className="font-mono">{billing.plan.currency}{billing.plan.basePriceMonthly.toLocaleString()}/mo</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-ink-soft">Additional members ({Math.max(0, billing.memberCount - 1)} × {billing.plan.currency}{billing.plan.perSeatPriceMonthly.toLocaleString()})</span>
            <span className="font-mono">{billing.plan.currency}{(Math.max(0, billing.memberCount - 1) * billing.plan.perSeatPriceMonthly).toLocaleString()}/mo</span>
          </div>
          <div className="border-t border-rule pt-2 flex justify-between text-sm">
            <span className="font-semibold">Total / month</span>
            <span className="font-mono font-bold text-register">{billing.plan.currency}{billing.monthlyAmount.toLocaleString()}/mo</span>
          </div>
          {billing.daysLeftInTrial !== null && (
            <div className="mt-2 text-xs text-amber bg-amber/10 px-3 py-2 rounded">
              {billing.daysLeftInTrial > 0
                ? `Free trial — ${billing.daysLeftInTrial} day${billing.daysLeftInTrial !== 1 ? "s" : ""} left (ends ${billing.trialEndsAt?.toLocaleDateString("en-US", { month: "short", day: "numeric" })})`
                : "Trial expired — billing should start"}
            </div>
          )}
        </div>
      </div>

      {/* Payment info */}
      {sub?.paystackAuthorizationCode && (
        <div className="bg-panel border border-rule rounded-md">
          <div className="px-4 py-3 border-b border-rule">
            <h2 className="font-mono text-sm uppercase tracking-wider m-0">Payment method</h2>
          </div>
          <div className="p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-ink-soft">Paystack customer</span>
              <span className="font-mono text-xs">{sub.paystackCustomerEmail}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-soft">Authorization code</span>
              <span className="font-mono text-xs">{sub.paystackAuthorizationCode}</span>
            </div>
            {sub.lastPaymentAt && (
              <div className="flex justify-between text-sm">
                <span className="text-ink-soft">Last payment</span>
                <span className="font-mono text-xs">
                  {sub.lastPaymentAmount ? `₦${(sub.lastPaymentAmount / 100).toLocaleString()} — ` : ""}
                  {sub.lastPaymentAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
            )}
            {sub.lastPaymentReference && (
              <div className="flex justify-between text-sm">
                <span className="text-ink-soft">Reference</span>
                <span className="font-mono text-xs">{sub.lastPaymentReference}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subscription management */}
      <div className="bg-panel border border-rule rounded-md">
        <div className="px-4 py-3 border-b border-rule">
          <h2 className="font-mono text-sm uppercase tracking-wider m-0">Subscription</h2>
        </div>
        <div className="p-4">
          <ManageSubscriptionForm
            orgId={org.id}
            currentSubId={sub?.id ?? null}
            currentPlanId={sub?.planId ?? null}
            currentStatus={sub?.status ?? null}
            plans={plans}
          />
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-panel border border-stamp/30 rounded-md">
        <div className="px-4 py-3 border-b border-stamp/30">
          <h2 className="font-mono text-sm uppercase tracking-wider m-0 text-stamp">Danger zone</h2>
        </div>
        <div className="p-4">
          <SuspendOrgForm orgId={org.id} orgName={org.name} />
        </div>
      </div>

      {/* Members */}
      <div className="bg-panel border border-rule rounded-md">
        <div className="px-4 py-3 border-b border-rule">
          <h2 className="font-mono text-sm uppercase tracking-wider m-0">Members ({members.length})</h2>
        </div>
        <div className="divide-y divide-dashed divide-rule">
          {members.map((m, i) => (
            <div key={m.userId} className="px-4 py-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">
                  {m.name}
                  {m.suspendedAt && <span className="text-stamp ml-2 text-xs">(suspended)</span>}
                </div>
                <div className="text-xs text-ink-soft truncate">{m.email}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                  m.role === "admin"
                    ? "bg-register/12 text-register"
                    : "bg-paper-2 text-ink-soft"
                }`}>
                  {m.role === "admin" ? "Workspace Admin" : m.role}
                </span>
                {m.role === "admin" ? (
                  <span className="text-xs font-mono text-ink-soft">
                    {billing.plan.currency}{billing.plan.basePriceMonthly.toLocaleString()}/mo
                  </span>
                ) : (
                  <span className="text-xs font-mono text-ink-soft">
                    {billing.plan.currency}{billing.plan.perSeatPriceMonthly.toLocaleString()}/mo
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
