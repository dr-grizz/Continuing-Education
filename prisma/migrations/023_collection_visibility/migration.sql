BEGIN;

-- Listing is independent of publication; preserve current discovery by default.
ALTER TABLE "collections" ADD COLUMN "listed" BOOLEAN NOT NULL DEFAULT true;

COMMIT;
