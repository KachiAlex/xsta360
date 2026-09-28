"use client";

import { useRef, useState } from "react";

export interface AttachmentDoc {
  id: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
}

// Email attachments beyond ~10 MB hurt deliverability — many inboxes reject
// larger messages outright.
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

/**
 * Attachment picker for sequence email steps.
 * Select existing org documents or upload a new file inline — uploaded files
 * are auto-selected and stored as a JSON array of document IDs.
 */
export function AttachmentPicker({
  documents,
  selectedIds,
  onChange,
}: {
  documents: AttachmentDoc[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<AttachmentDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Docs uploaded this session aren't in the server-loaded `documents` prop
  // yet — merge them so they render as selectable/selected.
  const allDocs = [
    ...documents,
    ...uploadedDocs.filter((u) => !documents.some((d) => d.id === u.id)),
  ];
  const selectedDocs = allDocs.filter((d) => selectedIds.includes(d.id));
  const availableDocs = allDocs.filter((d) => !selectedIds.includes(d.id));

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  async function uploadFile(file: File) {
    setUploadError(null);
    if (file.size > MAX_ATTACHMENT_SIZE) {
      setUploadError(
        `"${file.name}" is ${formatSize(file.size)} — email attachments should stay under 10 MB for deliverability.`,
      );
      return;
    }
    setUploading(true);
    try {
      const mime = file.type || "application/octet-stream";
      const initRes = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: mime,
          sizeBytes: file.size,
          leadId: null,
        }),
      });
      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({}));
        throw new Error(err.error || "Could not initialize upload");
      }
      const { uploadUrl, docId } = await initRes.json();

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mime },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);

      const doc: AttachmentDoc = {
        id: docId,
        fileName: file.name,
        sizeBytes: file.size,
        mimeType: mime,
      };
      setUploadedDocs((prev) => [...prev, doc]);
      onChange([...selectedIds, doc.id]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const uploadButton = (
    <>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadFile(f);
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="text-xs font-semibold text-[var(--accent)] hover:text-ink border border-rule rounded px-2.5 py-1.5 min-h-[36px] hover:bg-paper-2 transition-colors disabled:opacity-50"
      >
        {uploading ? "Uploading…" : "↑ Upload file"}
      </button>
    </>
  );

  return (
    <div>
      {/* Selected attachments */}
      {selectedDocs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedDocs.map((doc) => (
            <span
              key={doc.id}
              className="text-xs bg-panel border border-rule rounded px-2 py-1 flex items-center gap-1.5"
            >
              📎 {doc.fileName}
              <span className="text-ink-soft">({formatSize(doc.sizeBytes)})</span>
              <button
                type="button"
                onClick={() => toggle(doc.id)}
                className="text-ink-soft hover:text-stamp ml-0.5"
                aria-label={`Remove ${doc.fileName}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {availableDocs.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPicker(!showPicker)}
            className="text-xs font-semibold text-ink-soft hover:text-ink border border-rule rounded px-2.5 py-1.5 min-h-[36px] hover:bg-paper-2 transition-colors"
          >
            + From documents
          </button>
        )}
        {uploadButton}
      </div>

      {uploadError && <p className="text-xs text-stamp mt-1.5">{uploadError}</p>}
      {allDocs.length === 0 && !uploading && (
        <p className="text-[11px] text-ink-soft mt-1.5">
          No documents yet — upload one above to attach it, or add files on the Documents page.
        </p>
      )}

      {/* Document picker dropdown */}
      {showPicker && availableDocs.length > 0 && (
        <div className="mt-2 border border-rule rounded bg-panel max-h-[200px] overflow-y-auto">
          {availableDocs.map((doc) => (
            <button
              key={doc.id}
              type="button"
              onClick={() => {
                toggle(doc.id);
              }}
              className="w-full text-left px-3 py-2 hover:bg-paper-2 border-b border-dashed border-rule last:border-0 flex items-center gap-2 text-sm"
            >
              <span>📎</span>
              <span className="flex-1 truncate">{doc.fileName}</span>
              <span className="text-xs text-ink-soft">{formatSize(doc.sizeBytes)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
