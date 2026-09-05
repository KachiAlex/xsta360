"use client";

import { useState, useRef } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export interface PreviewAttachment {
  fileName: string;
  sizeBytes: number;
}

/**
 * Email preview modal.
 * Renders the email body HTML with placeholder substitution in an iframe
 * so the styles are isolated and it looks exactly like an email client.
 */
export function EmailPreview({
  subject,
  senderName,
  body,
  orgName,
  recipientName,
  attachments,
}: {
  subject: string;
  senderName: string;
  body: string;
  orgName: string;
  recipientName: string;
  attachments?: PreviewAttachment[];
}) {
  const [open, setOpen] = useState(false);

  // Substitute placeholders for preview.
  const previewSubject = substitutePlaceholders(subject, recipientName, orgName);
  const previewBody = substitutePlaceholders(body, recipientName, orgName);
  const previewSender = senderName || orgName;

  // Build the full HTML email for the iframe.
  const fullHtml = buildPreviewHtml(previewBody, previewSender);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="min-h-[36px]"
      >
        👁 Preview email
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Email preview"
        sub="How this email will appear to the lead"
      >
        <div className="space-y-3">
          {/* Email metadata */}
          <div className="border border-rule rounded p-3 bg-paper-2 text-sm space-y-1.5">
            <div className="flex gap-2">
              <span className="font-mono text-xs text-ink-soft w-16 shrink-0">From:</span>
              <span className="font-semibold">{previewSender} &lt;noreply@xsta360.app&gt;</span>
            </div>
            <div className="flex gap-2">
              <span className="font-mono text-xs text-ink-soft w-16 shrink-0">To:</span>
              <span>{recipientName} &lt;lead@email.com&gt;</span>
            </div>
            <div className="flex gap-2">
              <span className="font-mono text-xs text-ink-soft w-16 shrink-0">Subject:</span>
              <span className="font-semibold">{previewSubject}</span>
            </div>
            {attachments && attachments.length > 0 && (
              <div className="flex gap-2">
                <span className="font-mono text-xs text-ink-soft w-16 shrink-0">Attachments:</span>
                <div className="flex flex-wrap gap-1.5">
                  {attachments.map((a, i) => (
                    <span key={i} className="text-xs bg-panel border border-rule rounded px-2 py-0.5">
                      📎 {a.fileName} ({formatSize(a.sizeBytes)})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Email body in iframe */}
          <div className="border border-rule rounded overflow-hidden bg-white">
            <iframe
              srcDoc={fullHtml}
              className="w-full"
              style={{ minHeight: "300px", border: "none" }}
              title="Email preview"
              sandbox=""
            />
          </div>

          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function substitutePlaceholders(text: string, recipientName: string, orgName: string): string {
  return text
    .replace(/\{\{lead_name\}\}/g, recipientName)
    .replace(/\{\{first_name\}\}/g, recipientName.split(" ")[0] || recipientName)
    .replace(/\{\{org_name\}\}/g, orgName)
    .replace(/\{\{rep_name\}\}/g, "Your Rep")
    .replace(/\{\{lead_company\}\}/g, "Acme Corp")
    .replace(/\{\{lead_phone\}\}/g, "+234 800 000 0000")
    .replace(/\{\{lead_email\}\}/g, "lead@email.com");
}

function buildPreviewHtml(body: string, senderName: string): string {
  // If body is plain text (no HTML tags), convert line breaks.
  const isHtml = /<[a-z][\s\S]*>/i.test(body);
  const content = isHtml ? body : body.replace(/\n/g, "<br>");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 24px; color: #1E2A22; background: #fff; }
  .content { font-size: 15px; line-height: 1.6; max-width: 560px; margin: 0 auto; }
  .content a { color: #B23A2E; }
  .signature { color: #4A5750; font-size: 13px; margin-top: 32px; border-top: 1px solid #E5E0D8; padding-top: 16px; }
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>
  <div class="content">${content}</div>
  <p class="signature">— ${senderName}</p>
</body>
</html>`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
