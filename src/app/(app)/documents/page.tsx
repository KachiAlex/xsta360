import { requireAuth } from "@/lib/dal";
import { getOrgDocuments } from "@/lib/document-queries";
import { Topbar } from "@/components/app/topbar";
import { Panel, PanelHead } from "@/components/ui/panel";
import { DocumentListClient } from "@/components/app/document-list-client";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const ctx = await requireAuth();
  const documents = await getOrgDocuments(ctx.orgId);

  return (
    <>
      <Topbar />
      <main className="max-w-[1240px] w-full mx-auto px-5 sm:px-8 py-6 sm:py-8">
        <Panel>
          <PanelHead
            title="Documents"
            sub="Shared file library — upload contracts, proposals, and assets for your team"
          />
          <DocumentListClient
            leadId={null}
            initialDocuments={documents.map((d) => ({
              id: d.id,
              fileName: d.fileName,
              mimeType: d.mimeType,
              sizeBytes: d.sizeBytes,
              publicUrl: d.publicUrl,
              createdAt: d.createdAt.toISOString(),
              uploaderName: d.uploaderName,
            }))}
          />
        </Panel>
      </main>
    </>
  );
}
