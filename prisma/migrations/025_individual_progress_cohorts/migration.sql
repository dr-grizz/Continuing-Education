-- Explicit tracking assignments are independent from enrollment and payment.
BEGIN;
CREATE TABLE progress_plans (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),offering_id UUID NOT NULL REFERENCES offerings(id),
 revision INTEGER NOT NULL CHECK(revision>0),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),created_by TEXT NOT NULL,
 UNIQUE(offering_id,revision)
);
CREATE TABLE progress_steps (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),plan_id UUID NOT NULL REFERENCES progress_plans(id),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),position INTEGER NOT NULL CHECK(position>0),required BOOLEAN NOT NULL,
 UNIQUE(plan_id,position),UNIQUE(id,plan_id)
);
CREATE TABLE progress_participants (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),plan_id UUID NOT NULL REFERENCES progress_plans(id),
 learner_id UUID NOT NULL REFERENCES learners(id),assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),assigned_by TEXT NOT NULL,
 UNIQUE(plan_id,learner_id),UNIQUE(id,plan_id)
);
CREATE TABLE progress_evidence (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),sequence BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
 participant_id UUID NOT NULL,plan_id UUID NOT NULL,step_id UUID NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('not_started','in_progress','completed')),
 note TEXT NOT NULL CHECK(length(trim(note)) BETWEEN 10 AND 1000),reference TEXT NOT NULL DEFAULT '' CHECK(length(reference)<=500),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),recorded_by TEXT NOT NULL,
 FOREIGN KEY(participant_id,plan_id) REFERENCES progress_participants(id,plan_id),
 FOREIGN KEY(step_id,plan_id) REFERENCES progress_steps(id,plan_id)
);
CREATE INDEX progress_latest_evidence ON progress_evidence(participant_id,step_id,sequence DESC);
CREATE TABLE progress_cohorts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 plan_id UUID NOT NULL REFERENCES progress_plans(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),created_by TEXT NOT NULL,
 UNIQUE(id,plan_id)
);
CREATE TABLE progress_cohort_members (
 cohort_id UUID NOT NULL,participant_id UUID NOT NULL,plan_id UUID NOT NULL,active BOOLEAN NOT NULL DEFAULT true,
 changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),changed_by TEXT NOT NULL,
 PRIMARY KEY(cohort_id,participant_id),
 FOREIGN KEY(cohort_id,plan_id) REFERENCES progress_cohorts(id,plan_id),
 FOREIGN KEY(participant_id,plan_id) REFERENCES progress_participants(id,plan_id)
);
CREATE FUNCTION progress_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Progress requirements and evidence are immutable; create a revision or record a correction'; END; $$;
CREATE TRIGGER progress_plan_snapshot BEFORE UPDATE OR DELETE ON progress_plans FOR EACH ROW EXECUTE FUNCTION progress_history_immutable();
CREATE TRIGGER progress_step_snapshot BEFORE UPDATE OR DELETE ON progress_steps FOR EACH ROW EXECUTE FUNCTION progress_history_immutable();
CREATE TRIGGER progress_evidence_history BEFORE UPDATE OR DELETE ON progress_evidence FOR EACH ROW EXECUTE FUNCTION progress_history_immutable();
COMMIT;
