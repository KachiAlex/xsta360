SELECT column_name FROM information_schema.columns WHERE table_name='subscriptions' AND column_name IN ('grace_ends_at','trial_notice_at');
