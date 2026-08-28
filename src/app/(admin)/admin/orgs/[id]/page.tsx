import Link from "next/link";
import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { eq, count, sql } from "drizzle-orm";
import { Card } from "@/components/admin/card";
import { ManageSubscriptionForm } from "@/components/admin/manage-subscription-form";
import { SuspendOrgForm } from "@/components/admin/suspend-org-form";

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

  const [memberCount] = await db
    .select({ value: count() })
    .from(schema.memberships)
    .where(eq(schema.memberships.orgId, id));

  const [leadCount] = await db
    .select({ value: count() })
    .from(schema.leads)
    .where(eq(schema.leads.orgId, id));

  const members = await db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.memberships.role,
      suspendedAt: schema.users.suspendedAt,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
    .where(eq(schema.memberships.orgId, id));

  const [sub] = await db
    .select({
      id: schema.subscriptions.id,
      planId: schema.subscriptions.planId,
      status: schema.subscriptions.status,
      trialEndsAt: schema.subscriptions.trialEndsAt,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
      canceledAt: schema.subscriptions.canceledAt,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.orgId, id))
    .limit(1);

  const plans = await db
    .select({ id: schema.plans.id, name: schema.plans.name })
    .from(schema.plans)
    .where(eq(schema.plans.active, true))
    .orderBy(schema.plans.position);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/orgs" className="text-sm text-ink-soft hover:text-ink mb-2 inline-block">
          ← Back to orgs
        </Link>
        <h1 className="font-mono text-xl sm:text-2xl m-0 mb-1">{org.name}</h1>
        <p className="text-sm text-ink-soft font-mono m-0">{org.id}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Members" value={memberCount.value} />
        <Card label="Leads" value={leadCount.value} />
        <Card label="Plan" value={sub ? (plans.find((p) => p.id === sub.planId)?.name ?? "—") : "Free"} />
        <Card
          label="Status"
          value={sub?.status ?? "none"}
          tone={sub?.status === "active" ? "register" : sub?.status === "trialing" ? "default" : "stamp"}
        />
      </div>

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
          {members.map((m) => (
            <div key={m.userId} className="px-4 py-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">
                  {m.name}
                  {m.suspendedAt && <span className="text-stamp ml-2 text-xs">(suspended)</span>}
                </div>
                <div className="text-xs text-ink-soft truncate">{m.email}</div>
              </div>
              <span className="text-xs font-mono text-ink-soft shrink-0 ml-2 capitalize">{m.role}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
