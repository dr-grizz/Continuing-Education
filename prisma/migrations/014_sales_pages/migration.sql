-- Sales pages (decision F2, October 8, 2026): structured blocks per offering, edited as a
-- draft by content editors and published as append-only revisions.
BEGIN;

-- CreateTable
CREATE TABLE "sales_pages" (
    "offering_id" UUID NOT NULL,
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "published_revision" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "sales_pages_pkey" PRIMARY KEY ("offering_id")
);

-- CreateTable
CREATE TABLE "sales_page_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "offering_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "page" JSONB NOT NULL,
    "published_by" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_page_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_page_revisions_offering_id_revision_key" ON "sales_page_revisions"("offering_id", "revision");

-- AddForeignKey
ALTER TABLE "sales_pages" ADD CONSTRAINT "sales_pages_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_page_revisions" ADD CONSTRAINT "sales_page_revisions_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma does not model CHECK constraints or triggers.
ALTER TABLE "sales_pages"
  ADD CONSTRAINT "sales_pages_draft_check" CHECK (jsonb_typeof("draft") = 'object'),
  ADD CONSTRAINT "sales_pages_published_check" CHECK ("published" IS NULL OR jsonb_typeof("published") = 'object'),
  ADD CONSTRAINT "sales_pages_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "sales_pages_published_at_check" CHECK (("published" IS NULL) = ("published_at" IS NULL));
ALTER TABLE "sales_page_revisions"
  ADD CONSTRAINT "sales_page_revisions_revision_check" CHECK ("revision" > 0);

CREATE FUNCTION sales_page_revisions_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'sales_page_revisions is append-only';
END
$$ LANGUAGE plpgsql;
CREATE TRIGGER sales_page_revisions_no_update BEFORE UPDATE ON sales_page_revisions
  FOR EACH ROW EXECUTE FUNCTION sales_page_revisions_append_only();

COMMIT;
