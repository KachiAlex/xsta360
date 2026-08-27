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
