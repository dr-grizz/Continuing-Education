BEGIN;
CREATE TABLE learner_alert_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 kind text NOT NULL CHECK(kind IN ('stalled_verification','completion','credential_expiration','canvas_inactivity','canvas_performance')),
 offering_id uuid REFERENCES offerings(id), cohort_id uuid REFERENCES progress_cohorts(id), learner_id uuid REFERENCES learners(id),
 days integer NOT NULL DEFAULT 14 CHECK(days BETWEEN 1 AND 365), threshold integer NOT NULL DEFAULT 70 CHECK(threshold BETWEEN 0 AND 100),
 enabled boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 owner_id uuid NOT NULL REFERENCES staff_members(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 evaluated_at timestamptz, evaluation_error text, source_warning text,
 sync_started_at timestamptz, sync_checked_at timestamptz, sync_succeeded_at timestamptz, next_sync_at timestamptz NOT NULL DEFAULT now(),
 canvas_snapshot jsonb, sync_error text,
 CHECK(kind NOT LIKE 'canvas_%' OR offering_id IS NOT NULL),
 CHECK(kind <> 'credential_expiration' OR offering_id IS NULL)
);
CREATE TABLE learner_alerts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rule_id uuid NOT NULL REFERENCES learner_alert_rules(id), rule_version integer NOT NULL,
 episode_key text NOT NULL, subject_key text NOT NULL, learner_id uuid NOT NULL REFERENCES learners(id),
 title text NOT NULL, message text NOT NULL, evidence jsonb NOT NULL,
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','acknowledged','snoozed','resolved')),
 detected_at timestamptz NOT NULL DEFAULT now(), observed_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 snoozed_until timestamptz, resolution_kind text CHECK(resolution_kind IN ('manual','cleared','rule_changed')),
 version integer NOT NULL DEFAULT 1,
 UNIQUE(rule_id,rule_version,episode_key)
);
CREATE INDEX learner_alerts_queue ON learner_alerts(state,detected_at DESC);
CREATE TABLE learner_alert_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), alert_id uuid NOT NULL REFERENCES learner_alerts(id),
 action text NOT NULL, actor text NOT NULL, note text NOT NULL DEFAULT '', at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX learner_alert_history_alert ON learner_alert_history(alert_id,at);
CREATE FUNCTION immutable_learner_alert_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Alert history is append-only'; END $$;
CREATE TRIGGER learner_alert_history_immutable BEFORE UPDATE OR DELETE ON learner_alert_history FOR EACH ROW EXECUTE FUNCTION immutable_learner_alert_history();

COMMIT;
