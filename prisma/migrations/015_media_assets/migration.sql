-- Images uploaded for sales pages (October 8, 2026). Raster formats only (no
-- SVG, which can carry scripts), up to 5 MB.
BEGIN;

-- CreateTable
CREATE TABLE "media_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_type" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- Prisma does not model CHECK constraints.
ALTER TABLE "media_assets"
  ADD CONSTRAINT "media_assets_content_type_check" CHECK ("content_type" IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  ADD CONSTRAINT "media_assets_size_check" CHECK ("size" > 0 AND "size" <= 5242880 AND "size" = octet_length("bytes"));

COMMIT;
