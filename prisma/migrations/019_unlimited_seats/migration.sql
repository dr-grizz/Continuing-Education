BEGIN;
ALTER TABLE offerings ADD COLUMN unlimited_seats boolean NOT NULL DEFAULT false;
-- Null capacity means unlimited only when explicitly selected; otherwise it is an incomplete imported draft.
ALTER TABLE offerings ADD CONSTRAINT offerings_capacity_mode_check CHECK (
  (unlimited_seats AND capacity IS NULL) OR
  (NOT unlimited_seats AND (capacity IS NOT NULL OR
    (imported_from_canvas AND NOT published AND unpublished_at IS NULL)))
);
ALTER TABLE offerings DROP CONSTRAINT offerings_incomplete_import_check;
ALTER TABLE offerings ADD CONSTRAINT offerings_incomplete_import_check CHECK (
  (imported_from_canvas AND NOT published AND unpublished_at IS NULL) OR
  (price_cents IS NOT NULL AND (unlimited_seats OR capacity IS NOT NULL) AND course_type IS NOT NULL)
);
ALTER TABLE offerings DROP CONSTRAINT offerings_publication_ready;
ALTER TABLE offerings ADD CONSTRAINT offerings_publication_ready CHECK (NOT published OR (
  price_cents IS NOT NULL AND price_cents BETWEEN 0 AND 1000000 AND
  (unlimited_seats OR (capacity IS NOT NULL AND capacity BETWEEN 1 AND 10000)) AND course_type IS NOT NULL AND
  length(btrim(title)) BETWEEN 3 AND 120 AND
  category IN ('Technology','Leadership','Healthcare','Ministry') AND
  length(btrim(summary)) BETWEEN 10 AND 240 AND
  length(btrim(description)) BETWEEN 20 AND 4000 AND length(btrim(format)) BETWEEN 3 AND 100
));
COMMIT;
