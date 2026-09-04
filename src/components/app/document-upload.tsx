"use client";

import { useState, useRef, useCallback } from "react";

interface DocumentItem {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  publicUrl: string | null;
  createdAt: string;
  uploaderName: string | null;
}

interface UploadResponse {
  uploadUrl: string;
  docId: string;
  r2Key: string;
  publicUrl: string | null;
}

const MAX_SIZE = 100 * 1024 * 1024; // 100 MB

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType.includes("pdf")) return "📄";
  if (mimeType.includes("word") || mimeType.includes("document")) return "📝";
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType.includes("csv")) return "📊";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "📽️";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "🗜️";
  return "📎";
}

export function DocumentUpload({
  leadId,
  documents,
  onChanged,
}: {
  leadId?: string;
  documents: DocumentItem[];
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    if (file.size > MAX_SIZE) {
      setError(`File too large. Max 100 MB. "${file.name}" is ${formatFileSize(file.size)}.`);
      return;
    }

    setUploading(true);
    setError(null);
    setProgress(`Preparing upload for ${file.name}...`);

    try {
      // Step 1: Get presigned upload URL from our server.
      const initRes = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          leadId: leadId ?? null,
        }),
      });

      if (!initRes.ok) {
        const err = await initRes.json();
        throw new Error(err.error || "Failed to initialize upload");
      }

      const { uploadUrl }: UploadResponse = await initRes.json();

      // Step 2: Upload directly to R2 via presigned URL.
      setProgress(`Uploading ${file.name}...`);
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed: ${uploadRes.status}`);
      }

      setProgress(`Uploaded ${file.name} ✓`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(""), 2000);
    }
  }, [leadId, onChanged]);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    // Upload files sequentially.
    (async () => {
      for (const file of Array.from(files)) {
        await uploadFile(file);
      }
    })();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  async function handleDelete(docId: string) {
    if (!confirm("Delete this document?")) return;
    try {
      const res = await fetch(`/api/documents?id=${docId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-3">
      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded p-4 text-center cursor-pointer transition-colors ${
          dragOver ? "border-ink bg-paper-2" : "border-rule hover:border-ink-soft"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading}
        />
        {uploading ? (
          <p className="text-sm text-ink-soft">{progress}</p>
        ) : (
          <div className="text-sm text-ink-soft">
            <p className="font-semibold text-ink">Drop files here or click to upload</p>
            <p className="text-xs mt-1">Max 100 MB per file</p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-stamp">{error}</p>
      )}

      {/* Document list */}
      {documents.length > 0 ? (
        <ul className="space-y-1.5">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-2.5 border border-rule rounded p-2.5 bg-paper">
              <span className="text-lg flex-shrink-0">{fileIcon(doc.mimeType)}</span>
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/documents/${doc.id}/download`}
                  className="text-sm font-semibold text-ink hover:underline truncate block"
                >
                  {doc.fileName}
                </a>
                <div className="text-xs text-ink-soft flex gap-2">
                  <span>{formatFileSize(doc.sizeBytes)}</span>
                  {doc.uploaderName && <span>· {doc.uploaderName}</span>}
                  <span>· {new Date(doc.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(doc.id)}
                className="text-xs text-stamp hover:underline flex-shrink-0"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-soft text-center">No documents uploaded yet.</p>
      )}
    </div>
  );
}
