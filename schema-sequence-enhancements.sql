-- Phase: Sequence enhancement schema changes

-- Leads: unsubscribe tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unsubscribed_at timestamp with time zone;

-- Sequences: business hours + weekend skip
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS send_window_start text;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS send_window_end text;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS skip_weekends boolean NOT NULL DEFAULT false;
ALTER TABLE sequences ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Lagos';

-- Sequence steps: A/B testing variants
ALTER TABLE sequence_steps ADD COLUMN IF NOT EXISTS variant_b_subject text;
ALTER TABLE sequence_steps ADD COLUMN IF NOT EXISTS variant_b_body text;
ALTER TABLE sequence_steps ADD COLUMN IF NOT EXISTS variant_b_sender_name text;

-- Sequence enrollments: pause/reply/bounce/unsubscribe tracking
ALTER TABLE sequence_enrollments ADD COLUMN IF NOT EXISTS paused_reason text;
ALTER TABLE sequence_enrollments ADD COLUMN IF NOT EXISTS paused_at timestamp with time zone;
ALTER TABLE sequence_enrollments ADD COLUMN IF NOT EXISTS replied_at timestamp with time zone;
ALTER TABLE sequence_enrollments ADD COLUMN IF NOT EXISTS bounced_at timestamp with time zone;
ALTER TABLE sequence_enrollments ADD COLUMN IF NOT EXISTS bounce_reason text;
ALTER TABLE sequence_enrollments ADD COLUMN IF NOT EXISTS unsubscribe_token text UNIQUE;

-- New table: sequence_email_events (tracking opens, clicks, replies, bounces)
CREATE TABLE IF NOT EXISTS sequence_email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES sequence_enrollments(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES sequence_steps(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  url TEXT,
  variant TEXT,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS seq_email_events_enrollment_idx ON sequence_email_events(enrollment_id);
CREATE INDEX IF NOT EXISTS seq_email_events_step_idx ON sequence_email_events(step_id);
CREATE INDEX IF NOT EXISTS seq_email_events_org_type_idx ON sequence_email_events(org_id, event_type);

-- New table: sequence_templates
CREATE TABLE IF NOT EXISTS sequence_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  definition JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sequence_templates_org_idx ON sequence_templates(org_id);

-- Backfill unsubscribe tokens for existing enrollments
UPDATE sequence_enrollments SET unsubscribe_token = gen_random_uuid()::text WHERE unsubscribe_token IS NULL;
