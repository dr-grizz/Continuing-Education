BEGIN;

ALTER TABLE collections ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE collections ADD CONSTRAINT collections_archive_unpublished_check CHECK (archived_at IS NULL OR NOT published);

COMMIT;
