-- Convert status and type columns from text + CHECK to PostgreSQL enums (issue #2 follow-up).
-- Hand-reviewed: Prisma's draft dropped and re-added the columns, which would delete data.
-- Columns are converted in place with USING casts; any value outside an enum aborts the
-- whole migration, so existing data is either preserved exactly or left untouched.
BEGIN;

CREATE TYPE "course_type" AS ENUM ('cohort', 'self_paced');
CREATE TYPE "entitlement_status" AS ENUM ('awaiting_approval', 'approved', 'approval_expired', 'declined', 'reserved', 'provisioning', 'enrolled', 'expired', 'exception');
CREATE TYPE "operation_status" AS ENUM ('pending', 'running', 'succeeded', 'failed');
CREATE TYPE "simulated_outcome" AS ENUM ('normal', 'delayed', 'transient', 'identity_failure', 'canvas_failure');

-- Checks that compare these columns as text block the type change. The four value-list
-- checks are replaced by the enums; the schedule rule is recreated afterwards.
ALTER TABLE "offerings"
  DROP CONSTRAINT "offerings_course_type_check",
  DROP CONSTRAINT "offerings_schedule_check";
ALTER TABLE "entitlements" DROP CONSTRAINT "entitlements_status_check";
ALTER TABLE "operations"
  DROP CONSTRAINT "operations_status_check",
  DROP CONSTRAINT "operations_simulated_outcome_check";

ALTER TABLE "offerings"
  ALTER COLUMN "course_type" DROP DEFAULT,
  ALTER COLUMN "course_type" TYPE "course_type" USING "course_type"::"course_type",
  ALTER COLUMN "course_type" SET DEFAULT 'cohort';
ALTER TABLE "entitlements"
  ALTER COLUMN "status" TYPE "entitlement_status" USING "status"::"entitlement_status";
ALTER TABLE "operations"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "operation_status" USING "status"::"operation_status",
  ALTER COLUMN "status" SET DEFAULT 'pending',
  ALTER COLUMN "simulated_outcome" DROP DEFAULT,
  ALTER COLUMN "simulated_outcome" TYPE "simulated_outcome" USING "simulated_outcome"::"simulated_outcome",
  ALTER COLUMN "simulated_outcome" SET DEFAULT 'normal';

-- Scheduled courses need dates; self-paced courses have none (not expressible as an enum).
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_schedule_check" CHECK (
  (course_type = 'cohort' AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date)
  OR (course_type = 'self_paced' AND start_date IS NULL AND end_date IS NULL));

COMMIT;
