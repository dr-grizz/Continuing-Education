-- Learner account access for staff learner management (October 7, 2026).
-- Additive: existing learners become active with version 1.
BEGIN;

-- AlterTable
ALTER TABLE "learners" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "deactivated_at" TIMESTAMPTZ(6),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- Not modeled by Prisma: deactivated learners carry a date, active learners none.
ALTER TABLE "learners" ADD CONSTRAINT "learners_access_check"
  CHECK ((active AND deactivated_at IS NULL) OR (NOT active AND deactivated_at IS NOT NULL));

COMMIT;
