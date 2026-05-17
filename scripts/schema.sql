-- Storm the Tower — game schema (Neon Auth edition)
--
-- Authentication is provided by Neon Auth (Stack Auth-powered). User
-- identities are managed by Neon and synced into your project as
-- `neon_auth.users_sync` automatically — no auth tables are defined here.
--
-- If you are upgrading from an Auth.js-based install, drop the old auth
-- tables and the old runs table first (their `user_id` was INTEGER):
--
--   DROP TABLE IF EXISTS runs;
--   DROP TABLE IF EXISTS sessions, accounts, verification_token, users;
--
-- Then re-run this file.

CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  state         JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active', -- active | victory | defeat | abandoned
  version       INTEGER NOT NULL DEFAULT 0,
  last_action   TEXT, -- last idempotency key consumed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runs_user_active_idx
  ON runs (user_id) WHERE status = 'active';

-- Optional FK to neon_auth.users_sync. The schema/table only exists once
-- Neon Auth is enabled on the project — otherwise the constraint creation
-- silently fails and we proceed without it.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'neon_auth' AND table_name = 'users_sync'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'runs_user_id_fkey' AND table_name = 'runs'
  ) THEN
    ALTER TABLE runs
      ADD CONSTRAINT runs_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES neon_auth.users_sync(id)
      ON DELETE CASCADE;
  END IF;
END $$;
