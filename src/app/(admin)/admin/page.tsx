import { db, schema } from "@/db";
import { count, eq, sql } from "drizzle-orm";
import { Card } from "@/components/admin/card";

export default async function AdminOverviewPage() {
  const [orgCount] = await db
    .select({ value: count() })
    .from(schema.organizations);

  const [userCount] = await db
    .select({ value: count() })
    .from(schema.users)
    .where(eq(schema.users.isSuperadmin, false));

  const [leadCount] = await db
    .select({ value: count() })
    .from(schema.leads);

  const [activeSubs] = await db
    .select({ value: count() })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, "active"));

  const [trialingSubs] = await db
    .select({ value: count() })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.status, "trialing"));

  const [suspendedUsers] = await db
    .select({ value: count() })
    .from(schema.users)
    .where(sql`${schema.users.suspendedAt} IS NOT NULL`);

  // Recent orgs (last 5)
  const recentOrgs = await db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      createdAt: schema.organizations.createdAt,
    })
    .from(schema.organizations)
    .orderBy(sql`${schema.organizations.createdAt} DESC`)
    .limit(5);

  // Plan distribution
  const planDist = await db
    .select({
      planName: schema.plans.name,
      count: count(),
    })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
    .groupBy(schema.plans.name);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-mono text-xl sm:text-2xl m-0 mb-1">Platform Overview</h1>
        <p className="text-sm text-ink-soft m-0">High-level metrics across all organizations.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card label="Organizations" value={orgCount.value} />
        <Card label="Total users" value={userCount.value} sub={`${suspendedUsers.value} suspended`} />
        <Card label="Total leads" value={leadCount.value} />
        <Card
          label="Active subs"
          value={activeSubs.value}
          sub={`${trialingSubs.value} trialing`}
          tone="register"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent orgs */}
        <div className="bg-panel border border-rule rounded-md">
          <div className="px-4 py-3 border-b border-rule">
            <h2 className="font-mono text-sm uppercase tracking-wider m-0">Recent organizations</h2>
          </div>
          <div className="divide-y divide-dashed divide-rule">
            {recentOrgs.length === 0 ? (
              <div className="px-4 py-6 text-sm text-ink-soft text-center">No organizations yet.</div>
            ) : (
              recentOrgs.map((org) => (
                <div key={org.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{org.name}</div>
                    <div className="text-xs text-ink-soft font-mono">
                      {org.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </div>
                  </div>
                  <a
                    href={`/admin/orgs/${org.id}`}
                    className="text-xs font-semibold text-ink-soft hover:text-ink shrink-0 ml-2"
                  >
                    View →
                  </a>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Plan distribution */}
        <div className="bg-panel border border-rule rounded-md">
          <div className="px-4 py-3 border-b border-rule">
            <h2 className="font-mono text-sm uppercase tracking-wider m-0">Plan distribution</h2>
          </div>
          <div className="divide-y divide-dashed divide-rule">
            {planDist.length === 0 ? (
              <div className="px-4 py-6 text-sm text-ink-soft text-center">
                No subscriptions yet. Create plans and assign them to orgs.
              </div>
            ) : (
              planDist.map((row) => (
                <div key={row.planName} className="px-4 py-3 flex items-center justify-between">
                  <span className="font-semibold text-sm">{row.planName}</span>
                  <span className="font-mono text-sm text-ink-soft">{row.count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
