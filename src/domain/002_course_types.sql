ALTER TABLE offerings ADD COLUMN course_type text NOT NULL DEFAULT 'cohort'
  CHECK (course_type IN ('cohort', 'self_paced'));
ALTER TABLE offerings ALTER COLUMN start_date DROP NOT NULL;
ALTER TABLE offerings ALTER COLUMN end_date DROP NOT NULL;
UPDATE offerings SET course_type='self_paced', start_date=NULL, end_date=NULL
  WHERE lower(format) LIKE '%self-paced%';
ALTER TABLE offerings ADD CONSTRAINT offerings_schedule_check CHECK (
  (course_type='cohort' AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date)
  OR (course_type='self_paced' AND start_date IS NULL AND end_date IS NULL)
);
