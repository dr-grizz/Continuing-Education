-- Staff-curated collections and pathways, private saved courses and pathway follows
-- (decisions F3 and F4). Checks and the synthetic seed are hand-written; Prisma does not model checks.
BEGIN;

-- CreateEnum
CREATE TYPE "collection_kind" AS ENUM ('collection', 'pathway');

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "collection_kind" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_items" (
    "collection_id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "collection_items_pkey" PRIMARY KEY ("collection_id","offering_id")
);

-- CreateTable
CREATE TABLE "saved_courses" (
    "learner_id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_courses_pkey" PRIMARY KEY ("learner_id","offering_id")
);

-- CreateTable
CREATE TABLE "pathway_follows" (
    "learner_id" UUID NOT NULL,
    "collection_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pathway_follows_pkey" PRIMARY KEY ("learner_id","collection_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collections_slug_key" ON "collections"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "collection_items_collection_id_position_key" ON "collection_items"("collection_id", "position");

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "saved_courses" ADD CONSTRAINT "saved_courses_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "learners"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "saved_courses" ADD CONSTRAINT "saved_courses_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pathway_follows" ADD CONSTRAINT "pathway_follows_learner_id_fkey" FOREIGN KEY ("learner_id") REFERENCES "learners"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "pathway_follows" ADD CONSTRAINT "pathway_follows_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- Checks
ALTER TABLE "collections" ADD CONSTRAINT "collections_slug_check" CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 80);
ALTER TABLE "collections" ADD CONSTRAINT "collections_title_check" CHECK (length(btrim(title)) BETWEEN 3 AND 120);
ALTER TABLE "collections" ADD CONSTRAINT "collections_summary_check" CHECK (length(btrim(summary)) BETWEEN 10 AND 500);
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_position_check" CHECK (position > 0);

-- Synthetic samples built from the seeded offerings that exist in this database.
INSERT INTO "collections" (id, kind, slug, title, summary, published) VALUES
  ('20000000-0000-4000-8000-000000000001', 'collection', 'christian-leadership', 'Christian Leadership', 'Courses for leading people and ministries with biblical grounding. Sample collection.', true),
  ('20000000-0000-4000-8000-000000000002', 'collection', 'technology-at-work', 'Technology at Work', 'Practical data and AI skills for everyday work. Sample collection.', true),
  ('20000000-0000-4000-8000-000000000003', 'pathway', 'data-informed-leader', 'Data-Informed Leader', 'Build data skills, use AI responsibly, then lead a team with evidence. Sample pathway; the order is a recommendation.', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO "collection_items" (collection_id, offering_id, position)
SELECT v.collection_id::uuid, v.offering_id::uuid, v.position
FROM (VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 1),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 2),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 1),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000005', 2),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 1),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000005', 2),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 3)
) AS v(collection_id, offering_id, position)
WHERE EXISTS (SELECT 1 FROM offerings o WHERE o.id = v.offering_id::uuid)
  AND EXISTS (SELECT 1 FROM collections c WHERE c.id = v.collection_id::uuid)
ON CONFLICT DO NOTHING;

COMMIT;
