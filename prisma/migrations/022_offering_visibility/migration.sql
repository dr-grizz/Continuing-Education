BEGIN;

-- Discovery is independent of publication. Keep every existing course's
-- discovery preference unchanged, including drafts and previously unpublished courses.
ALTER TABLE offerings ADD COLUMN listed BOOLEAN NOT NULL DEFAULT true;

COMMIT;
