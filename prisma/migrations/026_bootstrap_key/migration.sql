-- Replace Microsoft-only setup with explicitly configured key authorization.
-- Retain completion tombstones, deadlines, permanent staff and saved settings.
ALTER TABLE bootstrap_control ALTER COLUMN owner_tenant DROP NOT NULL;
ALTER TABLE bootstrap_control ALTER COLUMN owner_object DROP NOT NULL;
DELETE FROM bootstrap_sessions;
DELETE FROM bootstrap_oauth_states;
CREATE TABLE bootstrap_key_limits (
  id integer PRIMARY KEY CHECK (id = 1),
  window_started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 21)
);
