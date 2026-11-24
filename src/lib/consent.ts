/**
 * WhatsApp consent keywords. Meta requires honoring opt-outs — a contact
 * replying "STOP" must stop receiving business-initiated messages, and
 * "START" re-enables them.
 */

const OPT_OUT_KEYWORDS = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
  "opt out",
  "opt-out",
  "optout",
  "stop messages",
  "remove me",
]);

const OPT_IN_KEYWORDS = new Set([
  "start",
  "unstop",
  "subscribe",
  "resubscribe",
  "opt in",
  "opt-in",
  "optin",
]);

/**
 * Classify an inbound message as a consent action.
 * Only exact (normalized) matches count — a sentence containing "stop"
 * ("can you stop by Friday?") is a normal reply, not an opt-out.
 */
export function getConsentAction(text: string): "out" | "in" | null {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[!.?,;:]+$/g, "")
    .replace(/\s+/g, " ");
  if (OPT_OUT_KEYWORDS.has(normalized)) return "out";
  if (OPT_IN_KEYWORDS.has(normalized)) return "in";
  return null;
}
