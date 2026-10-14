-- Prototype-only switch that chooses the simulated outcome for newly queued provisioning.
CREATE TABLE prototype_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO prototype_settings(key, value) VALUES ('provisioning_outcome', 'normal');
-- Each operation keeps the outcome chosen when it was queued, so restarts replay it deterministically.
ALTER TABLE operations
  ADD COLUMN simulated_outcome text NOT NULL DEFAULT 'normal'
    CHECK (simulated_outcome IN ('normal','delayed','transient','identity_failure','canvas_failure')),
  ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN delay_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN failed_at timestamptz;
