import { requireSuperadmin } from "@/lib/dal";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireSuperadmin();

  const [user] = await db
    .select({ name: schema.users.name, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, ctx.userId))
    .limit(1);

  return (
    <AdminShell userName={user?.name ?? "Superadmin"} email={user?.email ?? ""}>
      {children}
    </AdminShell>
  );
}
