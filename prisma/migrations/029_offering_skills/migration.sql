ALTER TABLE offerings ADD COLUMN skills JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE offerings ADD CONSTRAINT offerings_skills_check
  CHECK (jsonb_typeof(skills) = 'array' AND jsonb_array_length(skills) <= 20);
