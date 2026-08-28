import { db, schema } from "@/db";
import { eq, sql, count } from "drizzle-orm";

export default async function AdminSubscriptionsPage() {
  const subs = await db
    .select({
      id: schema.subscriptions.id,
      orgId: schema.subscriptions.orgId,
      orgName: schema.organizations.name,
      planName: schema.plans.name,
      planId: schema.plans.id,
      basePrice: schema.plans.basePriceMonthly,
      perSeat: schema.plans.perSeatPriceMonthly,
      currency: schema.plans.currency,
      status: schema.subscriptions.status,
      trialEndsAt: schema.subscriptions.trialEndsAt,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
      canceledAt: schema.subscriptions.canceledAt,
      createdAt: schema.subscriptions.createdAt,
    })
    .from(schema.subscriptions)
    .innerJoin(schema.organizations, eq(schema.subscriptions.orgId, schema.organizations.id))
    .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id))
    .orderBy(sql`${schema.subscriptions.createdAt} DESC`)
    .limit(200);

  // Get member counts for each org
  const memberCounts = await db
    .select({
      orgId: schema.memberships.orgId,
      count: count(),
    })
    .from(schema.memberships)
    .groupBy(schema.memberships.orgId);
  const memberCountMap = new Map(memberCounts.map((m) => [m.orgId, m.count]));

  // Orgs without subscriptions
  const orgsWithoutSubs = await db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      createdAt: schema.organizations.createdAt,
    })
    .from(schema.organizations)
    .where(
      sql`${schema.organizations.id} NOT IN (SELECT org_id FROM subscriptions)`,
    )
    .orderBy(sql`${schema.organizations.createdAt} DESC`)
    .limit(50);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-mono text-xl sm:text-2xl m-0 mb-1">Subscriptions</h1>
        <p className="text-sm text-ink-soft m-0">
          {subs.length} subscriptions · {orgsWithoutSubs.length} orgs without a plan
        </p>
      </div>

      {/* Subscriptions table */}
      <div className="hidden md:block bg-panel border border-rule rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper-2 border-b border-rule">
            <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft">
              <th className="px-4 py-3 font-semibold">Organization</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Members</th>
              <th className="px-4 py-3 font-semibold">Monthly</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Trial ends</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dashed divide-rule">
            {subs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-soft">
                  No subscriptions yet. New signups get a free trial automatically.
                </td>
              </tr>
            ) : (
              subs.map((s) => {
                const members = memberCountMap.get(s.orgId) ?? 1;
                const monthly = s.basePrice + Math.max(0, members - 1) * s.perSeat;
                return (
                  <tr key={s.id} className="hover:bg-paper-2/30">
                    <td className="px-4 py-3 font-semibold">{s.orgName}</td>
                    <td className="px-4 py-3">{s.planName}</td>
                    <td className="px-4 py-3 font-mono text-ink-soft">{members}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-register">
                      {s.currency}{monthly.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        s.status === "active" ? "bg-register/12 text-register"
                        : s.status === "trialing" ? "bg-amber/14 text-[#9c6014]"
                        : "bg-stamp/12 text-stamp"
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-soft">
                      {s.trialEndsAt ? s.trialEndsAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/admin/orgs/${s.orgId}`}
                        className="text-xs font-semibold text-ink-soft hover:text-ink"
                      >
                        Manage →
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-dashed divide-rule border border-rule rounded-md overflow-hidden">
        {subs.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-ink-soft">
            No subscriptions yet.
          </div>
        ) : (
          subs.map((s) => {
            const members = memberCountMap.get(s.orgId) ?? 1;
            const monthly = s.basePrice + Math.max(0, members - 1) * s.perSeat;
            return (
              <a key={s.id} href={`/admin/orgs/${s.orgId}`} className="block px-4 py-3 active:bg-paper-2/30">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm truncate">{s.orgName}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                    s.status === "active" ? "bg-register/12 text-register"
                    : s.status === "trialing" ? "bg-amber/14 text-[#9c6014]"
                    : "bg-stamp/12 text-stamp"
                  }`}>
                    {s.status}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-ink-soft">
                  <span>{s.planName} · {members} members</span>
                  <span className="font-mono font-semibold text-register">{s.currency}{monthly.toLocaleString()}/mo</span>
                </div>
              </a>
            );
          })
        )}
      </div>

      {/* Orgs without subscriptions */}
      {orgsWithoutSubs.length > 0 && (
        <div className="bg-panel border border-rule rounded-md">
          <div className="px-4 py-3 border-b border-rule">
            <h2 className="font-mono text-sm uppercase tracking-wider m-0">
              No plan ({orgsWithoutSubs.length})
            </h2>
          </div>
          <div className="divide-y divide-dashed divide-rule">
            {orgsWithoutSubs.map((org) => (
              <div key={org.id} className="px-4 py-3 flex items-center justify-between">
                <span className="font-semibold text-sm">{org.name}</span>
                <a
                  href={`/admin/orgs/${org.id}`}
                  className="text-xs font-semibold text-ink-soft hover:text-ink"
                >
                  Assign plan →
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
