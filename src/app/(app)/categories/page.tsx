import { requireAuth } from "@/lib/dal";
import { getOrgCategories } from "@/lib/category-queries";
import { getOrgSequences } from "@/lib/sequence-queries";
import { getOrgMembers } from "@/lib/queries";
import { Topbar } from "@/components/app/topbar";
import { Panel, PanelHead } from "@/components/ui/panel";
import { CategoryList } from "@/components/app/category-list";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const ctx = await requireAuth();
  const [categories, sequences, members] = await Promise.all([
    getOrgCategories(ctx.orgId),
    getOrgSequences(ctx.orgId),
    getOrgMembers(ctx.orgId),
  ]);

  return (
    <>
      <Topbar />
      <main className="max-w-[1240px] w-full mx-auto px-5 sm:px-8 py-6 sm:py-8">
        <Panel>
          <PanelHead
            title="Lead categories"
            sub="Group leads into workflow tracks — auto-enroll sequences, auto-assign reps, and auto-schedule follow-ups"
          />
          <CategoryList
            categories={categories.map((c) => ({
              id: c.id,
              name: c.name,
              description: c.description,
              color: c.color,
              icon: c.icon,
              linkedSequenceId: c.linkedSequenceId,
              linkedSequenceName: c.linkedSequenceName,
              defaultAssigneeId: c.defaultAssigneeId,
              defaultAssigneeName: c.defaultAssigneeName,
              followUpCadenceDays: c.followUpCadenceDays,
              active: c.active,
              leadCount: c.leadCount,
            }))}
            sequences={sequences.map((s) => ({ id: s.id, name: s.name }))}
            members={members.map((m) => ({ id: m.userId, name: m.name }))}
          />
        </Panel>
      </main>
    </>
  );
}
