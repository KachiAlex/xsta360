/**
 * WhatsApp Business integration.
 *
 * Two modes:
 * 1. Click-to-chat: generates a wa.me link that opens WhatsApp directly.
 *    No API key needed — works for any phone number.
 * 2. API sending: sends a message via the WhatsApp Business Cloud API.
 *    Requires org-level whatsappConfig (phoneNumberId + apiKey).
 */

// NOTE: click-to-chat helpers are client-safe (no server-only import).
// The sendWhatsAppMessage function is only called from server code.

interface WhatsAppConfig {
  enabled?: boolean;
  phoneNumberId?: string;
  apiKey?: string;
  wabaId?: string;
}

/**
 * Generate a click-to-chat WhatsApp link.
 * Opens a conversation with the given phone number in WhatsApp.
 * Phone should be in international format without + (e.g. "2348012345678").
 */
export function whatsappClickToChat(phone: string, message?: string): string {
  // Clean the phone number: remove +, spaces, dashes, parentheses.
  const cleaned = phone.replace(/[^\d]/g, "");
  const base = `https://wa.me/${cleaned}`;
  if (message) {
    return `${base}?text=${encodeURIComponent(message)}`;
  }
  return base;
}

/**
 * Send a WhatsApp message via the Cloud API.
 * Returns true on success, false on failure.
 */
export async function sendWhatsAppMessage(
  config: WhatsAppConfig | null,
  toPhone: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  if (!config?.enabled || !config.phoneNumberId || !config.apiKey) {
    return { success: false, error: "WhatsApp not configured" };
  }

  const cleaned = toPhone.replace(/[^\d]/g, "");

  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: cleaned,
          type: "text",
          text: { body: message },
        }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: err };
    }

    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Format a reminder message for WhatsApp.
 */
export function formatReminderMessage(
  leadName: string,
  reminderNote: string,
  orgName: string,
): string {
  return `🔔 Follow-up reminder from ${orgName}

Lead: ${leadName}
Action: ${reminderNote}

Open Xsta360 to log this activity.`;
}

/**
 * Format a message sent directly to a lead from a sequence step.
 * Professional outreach format — no internal references.
 */
export function formatLeadMessage(body: string, orgName: string): string {
  return `${body}

— ${orgName}`;
}

// ---------------------------------------------------------------------------
// Message templates (whatsapp_business_management)
// ---------------------------------------------------------------------------

export interface WhatsAppTemplate {
  id: string;
  name: string;
  category: string;
  status: string;
  language: string;
}

const GRAPH_API = "https://graph.facebook.com/v21.0";

function templatesReady(config: WhatsAppConfig | null): string | null {
  if (!config?.enabled || !config.apiKey) return "WhatsApp not configured";
  if (!config.wabaId) return "WhatsApp Business Account ID is required — add it in WhatsApp settings";
  return null;
}

/** List message templates on the org's WhatsApp Business Account. */
export async function listWhatsAppTemplates(
  config: WhatsAppConfig | null,
): Promise<{ success: boolean; templates?: WhatsAppTemplate[]; error?: string }> {
  const notReady = templatesReady(config);
  if (notReady) return { success: false, error: notReady };

  try {
    const res = await fetch(
      `${GRAPH_API}/${config!.wabaId}/message_templates?fields=id,name,category,status,language&limit=100`,
      { headers: { Authorization: `Bearer ${config!.apiKey}` } },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data?.error?.message ?? `HTTP ${res.status}` };
    }
    return { success: true, templates: (data.data ?? []) as WhatsAppTemplate[] };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/**
 * Create a message template (BODY component only).
 * Bodies containing {{n}} placeholders require example values — pass one
 * example per placeholder, comma-separated.
 */
export async function createWhatsAppTemplate(
  config: WhatsAppConfig | null,
  input: { name: string; category: string; language: string; body: string; examples?: string[] },
): Promise<{ success: boolean; error?: string }> {
  const notReady = templatesReady(config);
  if (notReady) return { success: false, error: notReady };

  const name = input.name.trim().toLowerCase();
  if (!/^[a-z0-9_]+$/.test(name)) {
    return { success: false, error: "Template name must be lowercase letters, numbers, and underscores only" };
  }

  const bodyComponent: Record<string, unknown> = { type: "BODY", text: input.body };
  const placeholderCount = (input.body.match(/\{\{\d+\}\}/g) ?? []).length;
  if (placeholderCount > 0) {
    const examples = input.examples ?? [];
    bodyComponent.example = {
      body_text: [Array.from({ length: placeholderCount }, (_, i) => examples[i]?.trim() || "Sample")],
    };
  }

  try {
    const res = await fetch(`${GRAPH_API}/${config!.wabaId}/message_templates`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config!.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        category: input.category,
        language: input.language || "en_US",
        components: [bodyComponent],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data?.error?.message ?? `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

/** Delete a template by name. */
export async function deleteWhatsAppTemplate(
  config: WhatsAppConfig | null,
  name: string,
): Promise<{ success: boolean; error?: string }> {
  const notReady = templatesReady(config);
  if (notReady) return { success: false, error: notReady };

  try {
    const res = await fetch(
      `${GRAPH_API}/${config!.wabaId}/message_templates?name=${encodeURIComponent(name)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${config!.apiKey}` } },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      return { success: false, error: data?.error?.message ?? `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
