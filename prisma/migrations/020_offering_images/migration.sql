BEGIN;

-- AlterTable
ALTER TABLE "offerings" ADD COLUMN     "image_media_id" UUID,
ADD COLUMN     "image_override" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_image_media_id_fkey" FOREIGN KEY ("image_media_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "offerings" ADD CONSTRAINT "offerings_image_override_check" CHECK (image_override OR image_media_id IS NULL);

COMMIT;
