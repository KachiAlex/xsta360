import { requireAuth } from "@/lib/dal";
import { getOrgStages, getOrgMembers } from "@/lib/queries";
import { getPipelineBoard } from "@/lib/pipeline";
import { getOrgCategories } from "@/lib/category-queries";
import { Topbar, ViewTab } from "@/components/app/topbar";
import { AddLeadModal } from "@/components/app/add-lead-modal";
import { MobileFab } from "@/components/app/fab";
import { PipelineBoard } from "@/components/app/pipeline-board";
import { EmptyState } from "@/components/app/empty-state";
import Link from "next/link";

export default async function PipelinePage(props: {
  searchParams: Promise<{ categoryId?: string }>;
}) {
  const ctx = await requireAuth();
  const filters = await props.searchParams;
  const [stages, members, categories, columns] = await Promise.all([
    getOrgStages(ctx.orgId),
    getOrgMembers(ctx.orgId),
    getOrgCategories(ctx.orgId),
    getPipelineBoard(ctx.orgId, filters.categoryId),
  ]);

  const totalLeads = columns.reduce((sum, c) => sum + c.leads.length, 0);
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, color: c.color }));

  return (
    <>
      <Topbar
        actions={<AddLeadModal stages={stages} members={members} currentUserId={ctx.userId} categories={categoryOptions} />}
      >
        <ViewTab active={false} href="/dashboard">
          Today&apos;s Follow-Ups
        </ViewTab>
        <ViewTab active href="/pipeline">
          Pipeline
        </ViewTab>
      </Topbar>

      <div className="content flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-7 max-w-[1240px] w-full mx-auto">
        <MobileFab>
          <AddLeadModal stages={stages} members={members} currentUserId={ctx.userId} categories={categoryOptions} />
        </MobileFab>

        {/* Category filter */}
        {categories.length > 0 && (
          <div className="mb-4">
            <form method="get" className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono uppercase tracking-wider text-ink-soft">Category:</span>
              <select
                name="categoryId"
                defaultValue={filters.categoryId ?? ""}
                className="text-sm border border-rule bg-panel rounded px-3 py-2 min-h-[44px]"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>
              <button type="submit" className="text-sm font-semibold border border-ink rounded px-4 py-2 hover:bg-paper-2 min-h-[44px]">
                Filter
              </button>
              {filters.categoryId && (
                <Link href="/pipeline" className="text-sm text-ink-soft underline min-h-[44px] flex items-center px-2">
                  Clear
                </Link>
              )}
            </form>
          </div>
        )}

        {totalLeads === 0 ? (
          <EmptyState
            title={filters.categoryId ? "No leads in this category" : "Your pipeline is empty"}
            description={
              filters.categoryId
                ? "Try a different category or clear the filter."
                : "Add leads to see them organized by stage. Drag cards between columns as deals progress."
            }
            action={<AddLeadModal stages={stages} members={members} currentUserId={ctx.userId} categories={categoryOptions} />}
          />
        ) : (
          <PipelineBoard initialColumns={columns} />
        )}
      </div>
    </>
  );
}
