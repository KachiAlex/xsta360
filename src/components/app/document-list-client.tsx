"use client";

import { useRouter } from "next/navigation";
import { DocumentUpload } from "@/components/app/document-upload";

interface DocumentItem {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  publicUrl: string | null;
  createdAt: string;
  uploaderName: string | null;
}

export function DocumentListClient({
  leadId,
  initialDocuments,
}: {
  leadId: string | null;
  initialDocuments: DocumentItem[];
}) {
  const router = useRouter();

  function onChanged() {
    router.refresh();
  }

  return (
    <DocumentUpload
      leadId={leadId ?? undefined}
      documents={initialDocuments}
      onChanged={onChanged}
    />
  );
}
