-- Add new audit event types
ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'category_created';
ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'category_updated';
ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'category_deleted';
ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'lead_category_assigned';
ALTER TYPE audit_event_type ADD VALUE IF NOT EXISTS 'lead_category_removed';

-- Lead categories table
CREATE TABLE IF NOT EXISTS "lead_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "color" text NOT NULL DEFAULT '#4A5750',
  "icon" text NOT NULL DEFAULT '🏷️',
  "linked_sequence_id" uuid REFERENCES "sequences"("id") ON DELETE SET NULL,
  "default_assignee_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "follow_up_cadence_days" integer,
  "active" boolean NOT NULL DEFAULT true,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "lead_categories_org_idx" ON "lead_categories" ("org_id");

-- Lead category assignments (many-to-many)
CREATE TABLE IF NOT EXISTS "lead_category_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE CASCADE,
  "category_id" uuid NOT NULL REFERENCES "lead_categories"("id") ON DELETE CASCADE,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "assigned_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "assigned_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "lead_category_assignments_lead_idx" ON "lead_category_assignments" ("lead_id");
CREATE INDEX IF NOT EXISTS "lead_category_assignments_category_idx" ON "lead_category_assignments" ("category_id");
CREATE UNIQUE INDEX IF NOT EXISTS "lead_category_assignments_uniq" ON "lead_category_assignments" ("lead_id", "category_id");
