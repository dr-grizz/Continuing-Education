BEGIN;

-- CreateTable
CREATE TABLE "staff_canvas_grants" (
    "staff_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "configuration_hash" TEXT NOT NULL,
    "encrypted_tokens" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_canvas_grants_pkey" PRIMARY KEY ("staff_id")
);

-- CreateTable
CREATE TABLE "canvas_course_schedule" (
    "id" TEXT NOT NULL,
    "owner_staff_id" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "interval_minutes" INTEGER NOT NULL DEFAULT 60,
    "next_run_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "canvas_course_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvas_course_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "staff_id" UUID NOT NULL,
    "request_key" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "configuration_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lease" TEXT,
    "lease_expires_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "course_count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "canvas_course_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvas_course_snapshots" (
    "configuration_hash" TEXT NOT NULL,
    "run_id" UUID NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "courses" JSONB NOT NULL,

    CONSTRAINT "canvas_course_snapshots_pkey" PRIMARY KEY ("configuration_hash")
);

-- CreateIndex
CREATE INDEX "canvas_course_runs_status_created_at_idx" ON "canvas_course_runs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "canvas_course_runs_staff_id_request_key_key" ON "canvas_course_runs"("staff_id", "request_key");

ALTER TABLE canvas_course_schedule ADD CONSTRAINT canvas_course_schedule_check
  CHECK (id='default' AND interval_minutes BETWEEN 15 AND 1440 AND version>0
    AND (NOT enabled OR (owner_staff_id IS NOT NULL AND next_run_at IS NOT NULL)));
ALTER TABLE canvas_course_runs ADD CONSTRAINT canvas_course_runs_check
  CHECK (status IN ('pending','running','succeeded','failed') AND trigger IN ('manual','scheduled')
    AND attempts BETWEEN 0 AND 2 AND course_count>=0
    AND (status<>'running' OR (lease IS NOT NULL AND lease_expires_at IS NOT NULL)));
ALTER TABLE canvas_course_snapshots ADD CONSTRAINT canvas_course_snapshot_array_check
  CHECK (jsonb_typeof(courses)='array');

COMMIT;
