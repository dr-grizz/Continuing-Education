BEGIN;

ALTER TABLE learners ADD COLUMN display_name TEXT,
  ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'mock',
  ADD COLUMN external_subject TEXT;
CREATE UNIQUE INDEX learners_auth_provider_external_subject_key ON learners(auth_provider, external_subject);
ALTER TABLE learners ADD CONSTRAINT learners_auth_identity_check CHECK (
  (auth_provider = 'mock' AND external_subject IS NULL) OR
  (auth_provider LIKE 'canvas:https://%' AND external_subject IS NOT NULL AND external_subject ~ '^[1-9][0-9]{0,19}$')
);

CREATE TABLE learner_oauth_states (
  state_hash CHAR(64) PRIMARY KEY,
  browser_hash CHAR(64) NOT NULL,
  configuration_hash CHAR(64) NOT NULL,
  return_to TEXT NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX learner_oauth_states_expires_at_idx ON learner_oauth_states(expires_at);

CREATE TABLE learner_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  learner_id UUID NOT NULL REFERENCES learners(id) ON DELETE CASCADE ON UPDATE NO ACTION,
  auth_provider TEXT NOT NULL,
  external_subject TEXT NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);
CREATE INDEX learner_sessions_learner_id_idx ON learner_sessions(learner_id);
CREATE INDEX learner_sessions_expires_at_idx ON learner_sessions(expires_at);

COMMIT;
