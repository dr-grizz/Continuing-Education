BEGIN;

CREATE TABLE staff_oauth_states (
  state_hash CHAR(64) PRIMARY KEY,
  browser_hash CHAR(64) NOT NULL,
  configuration_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX staff_oauth_states_expires_at_idx ON staff_oauth_states(expires_at);

CREATE TABLE staff_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  auth_provider TEXT NOT NULL,
  external_subject TEXT NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX staff_sessions_staff_id_idx ON staff_sessions(staff_id);
CREATE INDEX staff_sessions_expires_at_idx ON staff_sessions(expires_at);

COMMIT;
