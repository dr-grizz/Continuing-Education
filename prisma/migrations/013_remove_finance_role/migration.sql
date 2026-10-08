-- Remove the Finance staff role (October 8, 2026): the university Finance department
-- works in Stripe, not in the portal. Its permissions (sales figures, transactions,
-- refund requests) move to the staff administrator role in src/server/roles.ts.
-- PostgreSQL cannot drop an enum value, so the type is rebuilt without 'finance'.
BEGIN;

-- The synthetic demo member held only this role.
DELETE FROM "staff_members" WHERE email = 'finance@cuce.test' AND roles = ARRAY['finance']::staff_role[];

-- Anyone else holding only the Finance role would lose all access: stop instead.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "staff_members" WHERE roles = ARRAY['finance']::staff_role[]) THEN
    RAISE EXCEPTION 'Staff members hold only the Finance role. Give them another role in Staff, then migrate again.';
  END IF;
END $$;

UPDATE "staff_members"
   SET roles = array_remove(roles, 'finance'::staff_role), version = version + 1
 WHERE 'finance'::staff_role = ANY (roles);

ALTER TYPE "staff_role" RENAME TO "staff_role_old";
CREATE TYPE "staff_role" AS ENUM ('approver', 'catalog_manager', 'support', 'it_canvas_admin', 'staff_admin', 'content_editor');
ALTER TABLE "staff_members"
  ALTER COLUMN "roles" TYPE "staff_role"[] USING roles::text[]::"staff_role"[];
DROP TYPE "staff_role_old";

COMMIT;
