import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  uuid,
  index,
  uniqueIndex,
  jsonb,
  numeric,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const roleEnum = pgEnum("role", ["admin", "manager", "rep"]);
export type Role = (typeof roleEnum.enumValues)[number];

export const leadSourceEnum = pgEnum("lead_source", [
  "referral",
  "social",
  "ad",
  "walk_in",
  "embedded_form",
  "contact_card_scan",
  "other",
]);
export type LeadSource = (typeof leadSourceEnum.enumValues)[number];

export const stageKindEnum = pgEnum("stage_kind", [
  "open",
  "won",
  "lost",
]);
export type StageKind = (typeof stageKindEnum.enumValues)[number];

export const reminderStatusEnum = pgEnum("reminder_status", [
  "pending",
  "sent",
  "failed",
  "completed",
  "snoozed",
]);
export type ReminderStatus = (typeof reminderStatusEnum.enumValues)[number];

export const auditEventTypeEnum = pgEnum("audit_event_type", [
  "lead_created",
  "lead_updated",
  "remark_added",
  "activity_logged",
  "reminder_set",
  "reminder_completed",
  "reminder_snoozed",
  "stage_changed",
  "lead_assigned",
  "lead_lost",
  "lead_won",
  "todo_created",
  "todo_completed",
  "note_created",
  "document_uploaded",
  "sequence_enrolled",
  "sequence_step_sent",
  "sequence_completed",
  "duplicate_detected",
  "member_invited",
  "member_joined",
  "role_changed",
  "member_removed",
  // Platform-level events (superadmin actions, orgId may be null)
  "plan_created",
  "plan_updated",
  "plan_deleted",
  "subscription_created",
  "subscription_updated",
  "subscription_canceled",
  "user_suspended",
  "user_reactivated",
  "org_suspended",
  "stage_created",
  "stage_updated",
  "stage_deleted",
  "stage_probability_updated",
  "org_settings_updated",
  "reminder_deleted",
  "invite_revoked",
]);
export type AuditEventType = (typeof auditEventTypeEnum.enumValues)[number];

export const activityTypeEnum = pgEnum("activity_type", [
  "call",
  "email",
  "meeting",
  "note",
  "visit",
]);
export type ActivityType = (typeof activityTypeEnum.enumValues)[number];

export const todoStatusEnum = pgEnum("todo_status", ["pending", "completed"]);
export type TodoStatus = (typeof todoStatusEnum.enumValues)[number];

export const todoPriorityEnum = pgEnum("todo_priority", ["low", "medium", "high"]);
export type TodoPriority = (typeof todoPriorityEnum.enumValues)[number];

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "trialing",
  "past_due",
  "canceled",
]);
export type SubscriptionStatus = (typeof subscriptionStatusEnum.enumValues)[number];

// ---------------------------------------------------------------------------
// Organizations & users
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Embeddable form token — public, used to route embedded submissions.
  formToken: text("form_token").notNull().unique(),
  // Custom field definitions: [{ key, label, type: "text"|"number"|"select"|"date", options?: string[] }]
  customFieldDefs: jsonb("custom_field_defs").notNull().default([]),
  // WhatsApp Business config: { enabled, phoneNumberId, apiKey }
  whatsappConfig: jsonb("whatsapp_config"),
  // Currency symbol for deal values (e.g. "₦", "$", "€")
  currency: text("currency").notNull().default("₦"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Plans & subscriptions (platform-level, managed by superadmin)
// ---------------------------------------------------------------------------

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    // Hybrid per-seat pricing:
    // basePriceMonthly = what the workspace admin pays (e.g. ₦1000)
    // perSeatPriceMonthly = what each additional member costs (e.g. ₦500)
    basePriceMonthly: integer("base_price_monthly").notNull().default(1000),
    perSeatPriceMonthly: integer("per_seat_price_monthly").notNull().default(500),
    // Free trial length in days (0 = no trial).
    trialDays: integer("trial_days").notNull().default(30),
    // Currency symbol for display (e.g. "₦", "$").
    currency: text("currency").notNull().default("₦"),
    // Feature flags: { "sequences": true, "custom_fields": true, ... }
    features: jsonb("features").notNull().default({}),
    // Stripe price ID for future billing integration (nullable for manual billing).
    stripePriceId: text("stripe_price_id"),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    activeIdx: index("plans_active_idx").on(t.active),
  }),
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    status: subscriptionStatusEnum("status").notNull().default("trialing"),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    // Grace period for past_due subs — app access is blocked once this passes.
    // Set when a recurring charge fails; null means block immediately.
    graceEndsAt: timestamp("grace_ends_at", { withTimezone: true }),
    // Last time a "trial ending soon" email was sent (dedup for cron).
    trialNoticeAt: timestamp("trial_notice_at", { withTimezone: true }),
    // Paystack payment integration
    paystackCustomerCode: text("paystack_customer_code"),
    paystackAuthorizationCode: text("paystack_authorization_code"),
    paystackCustomerEmail: text("paystack_customer_email"),
    lastPaymentAt: timestamp("last_payment_at", { withTimezone: true }),
    lastPaymentAmount: integer("last_payment_amount"),
    lastPaymentReference: text("last_payment_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: uniqueIndex("subscriptions_org_idx").on(t.orgId),
    statusIdx: index("subscriptions_status_idx").on(t.status),
  }),
);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  // Platform-level superadmin flag — set via DB only, never via UI.
  // Superadmins bypass org-scoping and access /admin/* routes.
  isSuperadmin: boolean("is_superadmin").notNull().default(false),
  // Suspended users cannot sign in (managed by superadmin).
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// A user may belong to multiple organizations (membership row carries the role).
export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("rep"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgUserIdx: uniqueIndex("memberships_org_user_idx").on(t.orgId, t.userId),
    userOrgIdx: index("memberships_user_org_idx").on(t.userId, t.orgId),
  }),
);

// Password reset tokens.
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true })
    .notNull()
    .default(sql`now() + interval '1 hour'`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tokenIdx: index("password_reset_tokens_token_idx").on(t.token),
  emailIdx: index("password_reset_tokens_email_idx").on(t.email),
}));

// Pending invitations to join an org.
export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("rep"),
  token: text("token").notNull().unique(),
  invitedBy: uuid("invited_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  // Default 7-day expiry; used as the TTL for the copyable invite link.
  expiresAt: timestamp("expires_at", { withTimezone: true })
    .notNull()
    .default(sql`now() + interval '7 days'`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orgIdx: index("invitations_org_idx").on(t.orgId),
}));

// ---------------------------------------------------------------------------
// Pipeline configuration (per org)
// ---------------------------------------------------------------------------

export const pipelineStages = pgTable(
  "pipeline_stages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // open | won | lost — drives board rendering and win/loss logic.
    kind: stageKindEnum("kind").notNull().default("open"),
    position: integer("position").notNull().default(0),
    // Win probability for forecasting (0-100). Won=100, Lost=0 by default.
    probability: integer("probability").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgPosIdx: index("pipeline_stages_org_pos_idx").on(t.orgId, t.position),
  }),
);

// Configurable reason codes for lost deals (per org).
export const lostReasons = pgTable(
  "lost_reasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position").notNull().default(0),
    isDefault: boolean("is_default").notNull().default(false),
  },
  (t) => ({
    orgIdx: index("lost_reasons_org_idx").on(t.orgId),
  }),
);

// ---------------------------------------------------------------------------
// Leads, remarks, reminders
// ---------------------------------------------------------------------------

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    source: leadSourceEnum("source").notNull().default("other"),
    campaign: text("campaign"),
    notes: text("notes"),
    stageId: uuid("stage_id").references(() => pipelineStages.id, {
      onDelete: "set null",
    }),
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdById: uuid("created_by_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Deal value (monetary) for pipeline forecasting.
    value: numeric("value", { precision: 14, scale: 2 }),
    // Expected close date for forecasting.
    expectedCloseDate: timestamp("expected_close_date", { withTimezone: true }),
    // Lead score (0-100), computed from activity recency, stage, source, etc.
    score: integer("score").notNull().default(0),
    // Custom field values: { fieldKey: value }
    customFields: jsonb("custom_fields").notNull().default({}),
    // Freeform reason captured when a lead is moved to a Lost stage.
    lostReasonText: text("lost_reason_text"),
    lostReasonId: uuid("lost_reason_id").references(() => lostReasons.id, {
      onDelete: "set null",
    }),
    // Link back to the contact card that generated this lead, if any.
    contactCardId: uuid("contact_card_id").references(() => contactCards.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgStageIdx: index("leads_org_stage_idx").on(t.orgId, t.stageId),
    orgAssigneeIdx: index("leads_org_assignee_idx").on(t.orgId, t.assigneeId),
    orgSourceIdx: index("leads_org_source_idx").on(t.orgId, t.source),
    orgUpdatedIdx: index("leads_org_updated_idx").on(t.orgId, t.updatedAt),
    orgCreatedIdx: index("leads_org_created_idx").on(t.orgId, t.createdAt),
    contactCardIdx: index("leads_contact_card_idx").on(t.contactCardId),
  }),
);

export const remarks = pgTable(
  "remarks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    leadCreatedIdx: index("remarks_lead_created_idx").on(t.leadId, t.createdAt),
    orgIdx: index("remarks_org_idx").on(t.orgId),
  }),
);

// ---------------------------------------------------------------------------
// Contact cards (digital business cards with QR/public lead capture)
// ---------------------------------------------------------------------------

export const contactCards = pgTable(
  "contact_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    displayName: text("display_name").notNull(),
    title: text("title"),
    role: text("role"),
    company: text("company"),
    website: text("website"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    photoUrl: text("photo_url"),
    socialLinks: jsonb("social_links").notNull().default({}),
    qrCodeSvg: text("qr_code_svg"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("contact_cards_org_idx").on(t.orgId),
    userIdx: index("contact_cards_user_idx").on(t.userId),
    slugIdx: uniqueIndex("contact_cards_slug_idx").on(t.slug),
  }),
);

export const cardViews = pgTable(
  "card_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contactCardId: uuid("contact_card_id")
      .notNull()
      .references(() => contactCards.id, { onDelete: "cascade" }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
    deviceType: text("device_type"),
  },
  (t) => ({
    cardViewedIdx: index("card_views_card_viewed_idx").on(t.contactCardId, t.viewedAt),
  }),
);

// Structured activities: dated/timed touchpoints per lead (call, email, meeting, etc.)
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: activityTypeEnum("type").notNull().default("note"),
    body: text("body").notNull(),
    // When the activity actually happened (editable — can log past activities).
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    // Optional link to a reminder spawned from this activity.
    reminderId: uuid("reminder_id").references(() => reminders.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    leadOccurredIdx: index("activities_lead_occurred_idx").on(t.leadId, t.occurredAt),
    orgOccurredIdx: index("activities_org_occurred_idx").on(t.orgId, t.occurredAt),
  }),
);

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    assigneeId: uuid("assignee_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    note: text("note"),
    status: reminderStatusEnum("status").notNull().default("pending"),
    // Last error message when delivery failed (surfaced in-app per PRD edge case).
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    assigneeDueIdx: index("reminders_assignee_due_idx").on(t.assigneeId, t.dueAt),
    statusDueIdx: index("reminders_status_due_idx").on(t.status, t.dueAt),
    orgIdx: index("reminders_org_idx").on(t.orgId),
  }),
);

// ---------------------------------------------------------------------------
// To-dos (standalone or linked to a lead, with optional reminder)
// ---------------------------------------------------------------------------

export const todos = pgTable(
  "todos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Optional link to a lead.
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: todoStatusEnum("status").notNull().default("pending"),
    priority: todoPriorityEnum("priority").notNull().default("medium"),
    // Optional due date — acts as a reminder trigger.
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userStatusIdx: index("todos_user_status_idx").on(t.userId, t.status),
    orgUserIdx: index("todos_org_user_idx").on(t.orgId, t.userId),
    leadIdx: index("todos_lead_idx").on(t.leadId),
  }),
);

// ---------------------------------------------------------------------------
// Notes (standalone or linked to a lead)
// ---------------------------------------------------------------------------

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Optional link to a lead.
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgUserIdx: index("notes_org_user_idx").on(t.orgId, t.userId),
    leadIdx: index("notes_lead_idx").on(t.leadId),
  }),
);

// ---------------------------------------------------------------------------
// Lead documents / quote attachments
// ---------------------------------------------------------------------------

export const leadDocuments = pgTable(
  "lead_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    filename: text("filename").notNull(),
    // URL or path to the stored file (R2, local, or external URL).
    url: text("url").notNull(),
    // MIME type (e.g. application/pdf, image/png).
    mimeType: text("mime_type"),
    // File size in bytes.
    size: integer("size"),
    // Whether this document has been viewed by the lead (for quote tracking).
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    leadIdx: index("lead_documents_lead_idx").on(t.leadId),
    orgIdx: index("lead_documents_org_idx").on(t.orgId),
  }),
);

// ---------------------------------------------------------------------------
// Sales sequences (automated drip follow-ups)
// ---------------------------------------------------------------------------

export const sequences = pgTable(
  "sequences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Whether this sequence is active and can enroll new leads.
    active: boolean("active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index("sequences_org_idx").on(t.orgId),
  }),
);

export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Step order within the sequence.
    position: integer("position").notNull().default(0),
    // Days after enrollment to trigger this step.
    delayDays: integer("delay_days").notNull().default(0),
    // What to do: create a reminder, send an email, send a WhatsApp message.
    action: text("action").notNull().default("reminder"),
    // The template/content for the step.
    subject: text("subject"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    seqPosIdx: index("sequence_steps_seq_pos_idx").on(t.sequenceId, t.position),
  }),
);

export const sequenceEnrollments = pgTable(
  "sequence_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    enrolledBy: uuid("enrolled_by").references(() => users.id, {
      onDelete: "set null",
    }),
    // Current step position (0 = not started yet).
    currentStep: integer("current_step").notNull().default(0),
    status: text("status").notNull().default("active"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    seqLeadIdx: index("sequence_enrollments_seq_lead_idx").on(t.sequenceId, t.leadId),
    orgStatusIdx: index("sequence_enrollments_org_status_idx").on(t.orgId, t.status),
    leadIdx: index("sequence_enrollments_lead_idx").on(t.leadId),
  }),
);

// ---------------------------------------------------------------------------
// Audit / event log (success metrics + lead history)
// ---------------------------------------------------------------------------

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable for platform-level events (superadmin actions).
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    type: auditEventTypeEnum("type").notNull(),
    // Flexible payload for event-specific detail (fromStage, toStage, reason, etc.)
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgCreatedIdx: index("audit_events_org_created_idx").on(t.orgId, t.createdAt),
    leadCreatedIdx: index("audit_events_lead_created_idx").on(t.leadId, t.createdAt),
    orgTypeIdx: index("audit_events_org_type_idx").on(t.orgId, t.type),
  }),
);
