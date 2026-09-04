ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='token_version';
