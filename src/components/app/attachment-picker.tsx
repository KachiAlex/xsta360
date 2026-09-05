"use client";

import { useState } from "react";

export interface AttachmentDoc {
  id: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Attachment picker for sequence email steps.
 * Lets users select from existing org-level documents to attach to the email.
 * Selected document IDs are stored in a hidden input as a JSON array.
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

  const selectedDocs = documents.filter((d) => selectedIds.includes(d.id));
  const availableDocs = documents.filter((d) => !selectedIds.includes(d.id));

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  }

  if (documents.length === 0) {
    return (
      <div>
        <p className="text-xs text-ink-soft">
          No documents available to attach. Upload documents in the Documents page first.
        </p>
      </div>
    );
  }

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

      {/* Add attachment button */}
      {availableDocs.length > 0 && (
        <button
          type="button"
          onClick={() => setShowPicker(!showPicker)}
          className="text-xs font-semibold text-ink-soft hover:text-ink border border-rule rounded px-2.5 py-1.5 min-h-[36px] hover:bg-paper-2 transition-colors"
        >
          + Add attachment
        </button>
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
