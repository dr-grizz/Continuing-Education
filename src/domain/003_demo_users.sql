CREATE TABLE learners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Preserve all existing synthetic registrations without assigning them to a new email.
INSERT INTO learners(id) VALUES ('00000000-0000-4000-8000-000000000001');
INSERT INTO learners(id) SELECT DISTINCT learner_id FROM entitlements ON CONFLICT DO NOTHING;
ALTER TABLE entitlements ADD CONSTRAINT entitlements_learner_fk FOREIGN KEY (learner_id) REFERENCES learners(id);
