import { requireAuth } from "@/lib/dal";
import { getOrgSequences } from "@/lib/sequence-queries";
import { Topbar } from "@/components/app/topbar";
import { Panel, PanelHead } from "@/components/ui/panel";
import { SequenceList } from "@/components/app/sequence-list";

export default async function SequencesPage() {
  const ctx = await requireAuth();
  const sequences = await getOrgSequences(ctx.orgId);

  return (
    <>
      <Topbar>
        <span className="px-4 py-2 text-[13.5px] font-semibold bg-panel text-ink rounded shadow-[0_1px_0_var(--color-rule)]">
          Sequences
        </span>
      </Topbar>

      <div className="content flex-1 px-8 py-7 max-w-[1240px] w-full mx-auto">
        <Panel>
          <PanelHead title="Sales sequences" sub="Automated drip follow-ups — enroll leads and steps fire on a schedule" />
          <SequenceList sequences={sequences} />
        </Panel>
      </div>
    </>
  );
}
