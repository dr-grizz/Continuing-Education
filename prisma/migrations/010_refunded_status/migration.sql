-- A full refund ends course access (decision P5, October 7, 2026): registrations
-- move to 'refunded'. Kept alone and without BEGIN/COMMIT: a new enum value cannot
-- be used in the transaction that adds it.
ALTER TYPE "entitlement_status" ADD VALUE IF NOT EXISTS 'refunded';
