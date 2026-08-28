import Link from "next/link";
import { db, schema } from "@/db";
import { count, eq, sql } from "drizzle-orm";

export default async function AdminOrgsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const search = q?.trim();

  const orgs = await db
    .select({
      id: schema.organizations.id,
      name: schema.organizations.name,
      createdAt: schema.organizations.createdAt,
      memberCount: count(schema.memberships.id),
    })
    .from(schema.organizations)
    .leftJoin(schema.memberships, eq(schema.memberships.orgId, schema.organizations.id))
    .groupBy(schema.organizations.id, schema.organizations.name, schema.organizations.createdAt)
    .orderBy(sql`${schema.organizations.createdAt} DESC`)
    .limit(100);

  // Get subscription info for each org
  const subs = await db
    .select({
      orgId: schema.subscriptions.orgId,
      planName: schema.plans.name,
      status: schema.subscriptions.status,
      basePrice: schema.plans.basePriceMonthly,
      perSeat: schema.plans.perSeatPriceMonthly,
      currency: schema.plans.currency,
    })
    .from(schema.subscriptions)
    .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.id));

  const subMap = new Map(subs.map((s) => [s.orgId, s]));

  const filtered = search
    ? orgs.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : orgs;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-mono text-xl sm:text-2xl m-0 mb-1">Organizations</h1>
          <p className="text-sm text-ink-soft m-0">{filtered.length} organizations</p>
        </div>
        <form method="get" className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={search ?? ""}
            placeholder="Search orgs..."
            className="font-mono text-sm border border-rule bg-panel rounded px-3 py-2 min-h-[40px] w-[180px]"
          />
          <button
            type="submit"
            className="text-sm font-semibold border border-ink rounded px-3 py-2 min-h-[40px] hover:bg-paper-2 active:bg-paper-2"
          >
            Search
          </button>
        </form>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-panel border border-rule rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-paper-2 border-b border-rule">
            <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-ink-soft">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Members</th>
              <th className="px-4 py-3 font-semibold">Plan</th>
              <th className="px-4 py-3 font-semibold">Monthly</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dashed divide-rule">
            {filtered.map((org) => {
              const sub = subMap.get(org.id);
              const monthly = sub
                ? sub.basePrice + Math.max(0, org.memberCount - 1) * sub.perSeat
                : 0;
              return (
                <tr key={org.id} className="hover:bg-paper-2/30">
                  <td className="px-4 py-3 font-semibold">{org.name}</td>
                  <td className="px-4 py-3 font-mono text-ink-soft">{org.memberCount}</td>
                  <td className="px-4 py-3">{sub?.planName ?? <span className="text-ink-soft">Free</span>}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-register">
                    {sub ? `${sub.currency}${monthly.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {sub ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        sub.status === "active" ? "bg-register/12 text-register"
                        : sub.status === "trialing" ? "bg-amber/14 text-[#9c6014]"
                        : "bg-stamp/12 text-stamp"
                      }`}>
                        {sub.status}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-soft">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-soft">
                    {org.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/orgs/${org.id}`} className="text-xs font-semibold text-ink-soft hover:text-ink">
                      Manage →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-dashed divide-rule border border-rule rounded-md overflow-hidden">
        {filtered.map((org) => {
          const sub = subMap.get(org.id);
          const monthly = sub
            ? sub.basePrice + Math.max(0, org.memberCount - 1) * sub.perSeat
            : 0;
          return (
            <Link key={org.id} href={`/admin/orgs/${org.id}`} className="block px-4 py-3 active:bg-paper-2/30">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm truncate">{org.name}</span>
                {sub && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                    sub.status === "active" ? "bg-register/12 text-register"
                    : sub.status === "trialing" ? "bg-amber/14 text-[#9c6014]"
                    : "bg-stamp/12 text-stamp"
                  }`}>
                    {sub.status}
                  </span>
                )}
              </div>
              <div className="flex justify-between text-xs text-ink-soft">
                <span>{org.memberCount} members · {sub?.planName ?? "Free"}</span>
                {sub && <span className="font-mono font-semibold text-register">{sub.currency}{monthly.toLocaleString()}/mo</span>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
