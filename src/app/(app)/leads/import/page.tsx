import { requireAuth } from "@/lib/dal";
import { getOrgCategories } from "@/lib/category-queries";
import { Topbar } from "@/components/app/topbar";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const ctx = await requireAuth();
  const categories = await getOrgCategories(ctx.orgId);

  return (
    <>
      <Topbar />
      <ImportClient
        categories={categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon }))}
      />
    </>
  );
}
