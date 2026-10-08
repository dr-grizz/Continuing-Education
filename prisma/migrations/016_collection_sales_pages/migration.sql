-- Sales pages for collections and pathways (October 8, 2026): a page and its
-- revisions belong to exactly one offering or collection. Existing offering
-- pages keep their data; each gets a generated id.
BEGIN;

-- AlterTable
ALTER TABLE "sales_page_revisions" ADD COLUMN     "collection_id" UUID,
ALTER COLUMN "offering_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "sales_pages" DROP CONSTRAINT "sales_pages_pkey",
ADD COLUMN     "collection_id" UUID,
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
ALTER COLUMN "offering_id" DROP NOT NULL,
ADD CONSTRAINT "sales_pages_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_page_revisions_collection_id_revision_key" ON "sales_page_revisions"("collection_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "sales_pages_offering_id_key" ON "sales_pages"("offering_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_pages_collection_id_key" ON "sales_pages"("collection_id");

-- AddForeignKey
ALTER TABLE "sales_pages" ADD CONSTRAINT "sales_pages_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_page_revisions" ADD CONSTRAINT "sales_page_revisions_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma does not model CHECK constraints.
ALTER TABLE "sales_pages"
  ADD CONSTRAINT "sales_pages_subject_check" CHECK (num_nonnulls("offering_id", "collection_id") = 1);
ALTER TABLE "sales_page_revisions"
  ADD CONSTRAINT "sales_page_revisions_subject_check" CHECK (num_nonnulls("offering_id", "collection_id") = 1);

COMMIT;
