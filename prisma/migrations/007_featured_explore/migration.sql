-- Staff-chosen featured positions for the learner Explore tab. Checks and the seed are hand-written.
BEGIN;

-- AlterTable
ALTER TABLE "collections" ADD COLUMN     "featured_rank" INTEGER;

-- AlterTable
ALTER TABLE "offerings" ADD COLUMN     "featured_rank" INTEGER;

ALTER TABLE "offerings" ADD CONSTRAINT "offerings_featured_rank_check" CHECK (featured_rank BETWEEN 1 AND 5);
ALTER TABLE "collections" ADD CONSTRAINT "collections_featured_rank_check" CHECK (featured_rank BETWEEN 1 AND 3);

-- Carry over the former hard-coded spotlight picks, and feature the sample collections and pathway.
UPDATE "offerings" o SET featured_rank = v.rank
FROM (VALUES
  ('10000000-0000-4000-8000-000000000001'::uuid, 1),
  ('10000000-0000-4000-8000-000000000002'::uuid, 2),
  ('10000000-0000-4000-8000-000000000005'::uuid, 3)
) AS v(id, rank)
WHERE o.id = v.id AND o.published;

UPDATE "collections" c SET featured_rank = v.rank
FROM (VALUES
  ('christian-leadership', 1),
  ('technology-at-work', 2),
  ('data-informed-leader', 1)
) AS v(slug, rank)
WHERE c.slug = v.slug AND c.published;

COMMIT;
