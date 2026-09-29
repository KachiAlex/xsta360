/**
 * Shared plan feature labels — used by the billing page and the public
 * pricing section so both render identical wording for a plan's flags.
 */
export const FEATURE_LABELS: Record<string, string> = {
  leads: "Lead management",
  contact_card: "Digital contact card",
  custom_fields: "Custom fields",
  follow_ups: "Follow-up reminders",
  pipeline: "Pipeline board",
  tasks: "To-dos & notes",
  reports: "Reports & analytics",
  sequences: "Sequences",
  api_access: "API access",
  sso: "SSO",
  dedicated_support: "Dedicated support",
};

export const FEATURE_ORDER = [
  "leads",
  "contact_card",
  "custom_fields",
  "follow_ups",
  "pipeline",
  "tasks",
  "reports",
  "sequences",
  "api_access",
  "sso",
  "dedicated_support",
];

// Base features included on every plan (core CRM functionality).
export const BASE_FEATURES = ["leads", "follow_ups", "pipeline", "tasks"];
