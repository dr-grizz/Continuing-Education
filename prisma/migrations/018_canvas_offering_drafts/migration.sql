BEGIN;
ALTER TABLE offerings ADD COLUMN imported_from_canvas boolean NOT NULL DEFAULT false;
ALTER TABLE offerings ALTER COLUMN price_cents DROP NOT NULL;
ALTER TABLE offerings ALTER COLUMN capacity DROP NOT NULL;
ALTER TABLE offerings ALTER COLUMN course_type DROP NOT NULL;
ALTER TABLE offerings DROP CONSTRAINT offerings_schedule_check;
ALTER TABLE offerings ADD CONSTRAINT offerings_schedule_check CHECK (
  (imported_from_canvas AND NOT published AND unpublished_at IS NULL AND course_type IS NULL) OR
  (course_type='cohort' AND start_date IS NOT NULL AND end_date IS NOT NULL) OR
  (course_type='self_paced' AND start_date IS NULL AND end_date IS NULL)
);
ALTER TABLE offerings ADD CONSTRAINT offerings_incomplete_import_check CHECK (
  (imported_from_canvas AND NOT published AND unpublished_at IS NULL) OR
  (price_cents IS NOT NULL AND capacity IS NOT NULL AND course_type IS NOT NULL)
);
ALTER TABLE offerings ADD CONSTRAINT offerings_publication_ready CHECK (NOT published OR (
  price_cents IS NOT NULL AND price_cents BETWEEN 0 AND 1000000 AND
  capacity IS NOT NULL AND capacity BETWEEN 1 AND 10000 AND course_type IS NOT NULL AND
  length(btrim(title)) BETWEEN 3 AND 120 AND
  category IN ('Technology','Leadership','Healthcare','Ministry') AND
  length(btrim(summary)) BETWEEN 10 AND 240 AND
  length(btrim(description)) BETWEEN 20 AND 4000 AND length(btrim(format)) BETWEEN 3 AND 100
));
CREATE TABLE canvas_offering_mappings (
  installation_url text NOT NULL,
  course_id text NOT NULL,
  offering_id uuid NOT NULL,
  source jsonb NOT NULL,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT canvas_offering_mappings_pkey PRIMARY KEY (installation_url,course_id),
  CONSTRAINT canvas_offering_mappings_offering_id_fkey FOREIGN KEY(offering_id) REFERENCES offerings(id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX canvas_offering_mappings_offering_id_key ON canvas_offering_mappings(offering_id);
COMMIT;
