BEGIN;
-- Only archived, unused final requirement revisions may be removed. Evidence stays append-only.
CREATE OR REPLACE FUNCTION progress_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE plan_uuid UUID; offering_uuid UUID; plan_revision INTEGER;
BEGIN
 IF TG_OP = 'DELETE' AND TG_TABLE_NAME IN ('progress_plans','progress_steps') THEN
  IF TG_TABLE_NAME = 'progress_plans' THEN plan_uuid := OLD.id; ELSE plan_uuid := OLD.plan_id; END IF;
  SELECT offering_id, revision INTO offering_uuid, plan_revision FROM progress_plans WHERE id=plan_uuid;
  IF EXISTS(SELECT 1 FROM management_archives WHERE target='progress-plan' AND id=plan_uuid::text AND archived_at IS NOT NULL)
   AND NOT EXISTS(SELECT 1 FROM progress_participants WHERE plan_id=plan_uuid)
   AND NOT EXISTS(SELECT 1 FROM progress_cohorts WHERE plan_id=plan_uuid)
   AND NOT EXISTS(SELECT 1 FROM progress_plans WHERE offering_id=offering_uuid AND revision>plan_revision)
  THEN RETURN OLD; END IF;
 END IF;
 RAISE EXCEPTION 'Progress requirements and evidence are immutable; only archived unused final requirement revisions can be deleted';
END; $$;
COMMIT;
