import { db, schema } from "@/db";
import { eq, sql, count } from "drizzle-orm";
import { UserActionButtons } from "@/components/admin/user-action-buttons";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const search = q?.trim();

  const users = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      isSuperadmin: schema.users.isSuperadmin,
      suspendedAt: schema.users.suspendedAt,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .orderBy(sql`${schema.users.createdAt} DESC`)
    .limit(200);

  // Get org memberships for each user
  const memberships = await db
    .select({
      userId: schema.memberships.userId,
      orgName: schema.organizations.name,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.organizations, eq(schema.memberships.orgId, schema.organizations.id));

  const membershipMap = new Map<string, { orgName: string; role: string }[]>();
  for (const m of memberships) {
    if (!membershipMap.has(m.userId)) membershipMap.set(m.userId, []);
    membershipMap.get(m.userId)!.push({ orgName: m.orgName, role: m.role });
  }

  const filtered = search
    ? users.filter(
        (u) =>
          u.name.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase()),
      )
    : users;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-mono text-xl sm:text-2xl m-0 mb-1">Users</h1>
          <p className="text-sm text-ink-soft m-0">{filtered.length} users</p>
        </div>
        <form method="get" className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={search ?? ""}
            placeholder="Search users..."
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
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Orgs</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dashed divide-rule">
            {filtered.map((u) => {
              const orgs = membershipMap.get(u.id) ?? [];
              return (
                <tr key={u.id} className="hover:bg-paper-2/30">
                  <td className="px-4 py-3 font-semibold">
                    {u.name}
                    {u.isSuperadmin && (
                      <span className="ml-2 text-[10px] font-mono uppercase text-stamp bg-stamp/10 px-1.5 py-0.5 rounded">
                        Superadmin
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{u.email}</td>
                  <td className="px-4 py-3 text-xs text-ink-soft">
                    {orgs.length === 0 ? (
                      <span>—</span>
                    ) : (
                      orgs.map((o, i) => (
                        <span key={i}>
                          {o.orgName} <span className="capitalize">({o.role})</span>
                          {i < orgs.length - 1 && ", "}
                        </span>
                      ))
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.suspendedAt ? (
                      <span className="text-xs font-semibold text-stamp">Suspended</span>
                    ) : (
                      <span className="text-xs font-semibold text-register">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink-soft">
                    {u.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!u.isSuperadmin && (
                      <UserActionButtons userId={u.id} suspended={!!u.suspendedAt} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-dashed divide-rule border border-rule rounded-md overflow-hidden">
        {filtered.map((u) => {
          const orgs = membershipMap.get(u.id) ?? [];
          return (
            <div key={u.id} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm truncate">
                  {u.name}
                  {u.isSuperadmin && (
                    <span className="ml-1.5 text-[9px] font-mono uppercase text-stamp bg-stamp/10 px-1 py-0.5 rounded">
                      Admin
                    </span>
                  )}
                </span>
                {u.suspendedAt ? (
                  <span className="text-[10px] font-semibold text-stamp shrink-0">Suspended</span>
                ) : (
                  <span className="text-[10px] font-semibold text-register shrink-0">Active</span>
                )}
              </div>
              <div className="text-xs text-ink-soft mb-1.5 truncate">{u.email}</div>
              <div className="text-xs text-ink-soft mb-2">
                {orgs.length === 0 ? "No org" : orgs.map((o) => o.orgName).join(", ")}
              </div>
              {!u.isSuperadmin && (
                <UserActionButtons userId={u.id} suspended={!!u.suspendedAt} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
