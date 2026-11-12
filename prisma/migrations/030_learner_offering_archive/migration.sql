BEGIN;
ALTER TABLE learners ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE learners ADD CONSTRAINT learners_archive_inactive_check CHECK (archived_at IS NULL OR NOT active);
ALTER TABLE offerings ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE offerings ADD CONSTRAINT offerings_archive_unpublished_check CHECK (archived_at IS NULL OR NOT published);
COMMIT;
