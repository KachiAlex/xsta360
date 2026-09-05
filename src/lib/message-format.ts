import "server-only";

/**
 * Text formatting utilities for sequence step messages.
 *
 * Supports:
 * - Variable placeholders: {{lead_name}}, {{lead_company}}, {{lead_phone}},
 *   {{lead_email}}, {{rep_name}}, {{org_name}}
 * - Markdown-like syntax for emails: **bold**, *italic*, [link](url), line breaks
 * - WhatsApp formatting: *bold*, _italic_, ~strikethrough~, line breaks
 */

export interface MessageContext {
  leadName: string;
  leadCompany: string | null;
  leadPhone: string | null;
  leadEmail: string | null;
  repName: string | null;
  orgName: string;
}

/**
 * Replace {{placeholder}} variables in a text string with actual values.
 */
export function replacePlaceholders(text: string, ctx: MessageContext): string {
  const replacements: Record<string, string> = {
    lead_name: ctx.leadName || "there",
    lead_company: ctx.leadCompany || "",
    lead_phone: ctx.leadPhone || "",
    lead_email: ctx.leadEmail || "",
    rep_name: ctx.repName || "our team",
    org_name: ctx.orgName,
    first_name: ctx.leadName?.split(" ")[0] || "there",
  };

  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return replacements[key] ?? match;
  });
}

/**
 * Convert markdown-like syntax to HTML for email sending.
 *
 * Supported:
 * - **bold** → <strong>bold</strong>
 * - *italic* → <em>italic</em>
 * - [text](url) → <a href="url">text</a>
 * - Line breaks → <br>
 * - • or - at start of line → bullet list
 */
export function markdownToHtml(text: string): string {
  // Escape HTML entities first.
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Links: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color: #B23A2E;">$1</a>');

  // Bold: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Italic: *text* (but not ** which is bold)
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");

  // Line breaks
  html = html.replace(/\n/g, "<br>");

  return html;
}

/**
 * Build a styled HTML email body from a sequence step's content.
 * Includes tracking pixel, link rewriting, and unsubscribe footer.
 */
export function buildEmailHtml(
  body: string,
  orgName: string,
  tracking?: { eventId: string; appUrl: string; unsubscribeToken: string },
): string {
  const contentHtml = markdownToHtml(body);
  return buildEmailWrapper(contentHtml, orgName, tracking);
}

/**
 * Build a styled HTML email body from rich text editor content (already HTML).
 * Includes tracking pixel, link rewriting, and unsubscribe footer.
 */
export function buildEmailHtmlFromRich(
  body: string,
  orgName: string,
  tracking?: { eventId: string; appUrl: string; unsubscribeToken: string },
): string {
  let contentHtml = body;
  if (tracking) {
    contentHtml = rewriteLinksForTracking(body, tracking.eventId, tracking.appUrl);
  }
  return buildEmailWrapper(contentHtml, orgName, tracking);
}

/**
 * Build the email wrapper with signature, tracking pixel, and unsubscribe footer.
 */
function buildEmailWrapper(
  contentHtml: string,
  orgName: string,
  tracking?: { eventId: string; appUrl: string; unsubscribeToken: string },
): string {
  const trackingPixel = tracking
    ? `<img src="${tracking.appUrl}/api/track/open?e=${tracking.eventId}" width="1" height="1" alt="" style="display:none;border:0;outline:none;text-decoration:none;" />`
    : "";
  const unsubscribeFooter = tracking
    ? `<p style="color: #8A8A8A; font-size: 11px; margin-top: 24px;"><a href="${tracking.appUrl}/api/track/unsubscribe?token=${tracking.unsubscribeToken}" style="color: #8A8A8A;">Unsubscribe</a> from these emails.</p>`
    : "";

  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1E2A22;">
  <div style="font-size: 15px; line-height: 1.6; white-space: normal;">${contentHtml}</div>
  <p style="color: #4A5750; font-size: 13px; margin-top: 32px; border-top: 1px solid #E5E0D8; padding-top: 16px;">— ${orgName}</p>
  ${unsubscribeFooter}
  ${trackingPixel}
</div>`;
}

/**
 * Rewrite all href links in HTML to go through our click tracking endpoint.
 * The original URL is preserved as a query parameter and the user is redirected.
 */
function rewriteLinksForTracking(html: string, eventId: string, appUrl: string): string {
  return html.replace(/href="(https?:\/\/[^"]+)"/g, (match, url) => {
    const trackedUrl = `${appUrl}/api/track/click?e=${eventId}&u=${encodeURIComponent(url)}`;
    return `href="${trackedUrl}"`;
  });
}

/**
 * Format a WhatsApp message with lead-facing content.
 * WhatsApp supports its own markdown:
 * - *bold*
 * - _italic_
 * - ~strikethrough~
 * - Line breaks are preserved
 */
export function formatWhatsAppMessage(body: string, orgName: string): string {
  // WhatsApp supports *bold*, _italic_, ~strike~ natively.
  // Just append the signature.
  return `${body}

— ${orgName}`;
}

/**
 * All available placeholders for display in the UI.
 */
export const AVAILABLE_PLACEHOLDERS = [
  { token: "{{lead_name}}", description: "Lead's full name" },
  { token: "{{first_name}}", description: "Lead's first name" },
  { token: "{{lead_company}}", description: "Lead's company" },
  { token: "{{lead_phone}}", description: "Lead's phone number" },
  { token: "{{lead_email}}", description: "Lead's email" },
  { token: "{{rep_name}}", description: "Assigned rep's name" },
  { token: "{{org_name}}", description: "Your organization name" },
] as const;
