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

// ---------------------------------------------------------------------------
// Organizations & users
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Embeddable form token — public, used to route embedded submissions.
  formToken: text("form_token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    // Freeform reason captured when a lead is moved to a Lost stage.
    lostReasonText: text("lost_reason_text"),
    lostReasonId: uuid("lost_reason_id").references(() => lostReasons.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgStageIdx: index("leads_org_stage_idx").on(t.orgId, t.stageId),
    orgAssigneeIdx: index("leads_org_assignee_idx").on(t.orgId, t.assigneeId),
    orgSourceIdx: index("leads_org_source_idx").on(t.orgId, t.source),
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
  }),
);

// ---------------------------------------------------------------------------
// Audit / event log (success metrics + lead history)
// ---------------------------------------------------------------------------

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
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
