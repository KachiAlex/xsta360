ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS grace_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_notice_at timestamptz;
SELECT column_name FROM information_schema.columns WHERE table_name='subscriptions' AND column_name IN ('grace_ends_at','trial_notice_at');
