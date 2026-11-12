-- Temporary, explicitly authorized setup; no automatic administrator is seeded.
CREATE TABLE bootstrap_control (
  id integer PRIMARY KEY CHECK (id = 1),
  generation uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  owner_tenant uuid NOT NULL,
  owner_object uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  handoff_staff_id uuid,
  handoff_linked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE bootstrap_sessions (
  token_hash char(64) PRIMARY KEY,
  generation uuid NOT NULL REFERENCES bootstrap_control(generation),
  display_name text NOT NULL,
  email text NOT NULL,
  configuration_hash char(64) NOT NULL,
  authenticated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bootstrap_sessions_expiry ON bootstrap_sessions(expires_at);
CREATE TABLE bootstrap_oauth_states (
  state_hash char(64) PRIMARY KEY,
  browser_hash char(64) NOT NULL,
  generation uuid NOT NULL REFERENCES bootstrap_control(generation),
  purpose text NOT NULL CHECK (purpose IN ('entra', 'canvas')),
  encrypted_payload text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bootstrap_oauth_states_expiry ON bootstrap_oauth_states(expires_at);
CREATE TABLE application_settings (
  name text PRIMARY KEY,
  encrypted_value text NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
