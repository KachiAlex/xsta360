import { requireAuth, getOrgPlan, planHasFeature } from "@/lib/dal";
import { UpgradePrompt } from "@/components/app/upgrade-prompt";
import { getOrgSequences } from "@/lib/sequence-queries";
import { getOrgDocuments } from "@/lib/document-queries";
import { Topbar } from "@/components/app/topbar";
import { Panel, PanelHead } from "@/components/ui/panel";
import { SequenceList } from "@/components/app/sequence-list";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export default async function SequencesPage() {
  const ctx = await requireAuth();
  const plan = await getOrgPlan(ctx.orgId);
  if (!planHasFeature(plan, "sequences")) {
    return <UpgradePrompt feature="sequences" plan={plan} />;
  }

  const [sequences, documents, orgRow] = await Promise.all([
    getOrgSequences(ctx.orgId),
    getOrgDocuments(ctx.orgId),
    db.select({ name: schema.organizations.name }).from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId)).limit(1),
  ]);

  return (
    <>
      <Topbar>
        <span className="px-4 py-2 text-[13.5px] font-semibold bg-panel text-ink rounded shadow-[0_1px_0_var(--color-rule)]">
          Sequences
        </span>
      </Topbar>

      <div className="content flex-1 px-3 sm:px-6 lg:px-8 py-4 sm:py-7 max-w-[1240px] w-full mx-auto">
        <Panel>
          <PanelHead title="Sales sequences" sub="Automated drip follow-ups — enroll leads and steps fire on a schedule" />
          <SequenceList
            sequences={sequences}
            documents={documents.map((d) => ({
              id: d.id,
              fileName: d.fileName,
              sizeBytes: d.sizeBytes,
              mimeType: d.mimeType,
            }))}
            orgName={orgRow[0]?.name ?? "Xsta360"}
          />
        </Panel>
      </div>
    </>
  );
}
