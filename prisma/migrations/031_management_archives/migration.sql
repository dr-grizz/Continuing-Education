BEGIN;
CREATE TABLE management_archives (
 target TEXT NOT NULL, id TEXT NOT NULL, name TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
 archived_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ,
 PRIMARY KEY(target,id), CHECK(deleted_at IS NULL OR archived_at IS NOT NULL)
);
COMMIT;
