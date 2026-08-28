import { requireAuth } from "@/lib/dal";
import { getOrgStages, getOrgMembers } from "@/lib/queries";
import { getPipelineBoard } from "@/lib/pipeline";
import { Topbar, ViewTab } from "@/components/app/topbar";
import { AddLeadModal } from "@/components/app/add-lead-modal";
import { PipelineBoard } from "@/components/app/pipeline-board";
import { EmptyState } from "@/components/app/empty-state";

export default async function PipelinePage() {
  const ctx = await requireAuth();
  const [stages, members, columns] = await Promise.all([
    getOrgStages(ctx.orgId),
    getOrgMembers(ctx.orgId),
    getPipelineBoard(ctx.orgId),
  ]);

  const totalLeads = columns.reduce((sum, c) => sum + c.leads.length, 0);

  return (
    <>
      <Topbar
        actions={<AddLeadModal stages={stages} members={members} currentUserId={ctx.userId} />}
      >
        <ViewTab active={false} href="/dashboard">
          Today&apos;s Follow-Ups
        </ViewTab>
        <ViewTab active href="/pipeline">
          Pipeline
        </ViewTab>
      </Topbar>

      <div className="content flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-7 max-w-[1240px] w-full mx-auto">
        {totalLeads === 0 ? (
          <EmptyState
            title="Your pipeline is empty"
            description="Add leads to see them organized by stage. Drag cards between columns as deals progress."
            action={<AddLeadModal stages={stages} members={members} currentUserId={ctx.userId} />}
          />
        ) : (
          <PipelineBoard initialColumns={columns} />
        )}
      </div>
    </>
  );
}
