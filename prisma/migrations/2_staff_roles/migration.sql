-- Staff directory and roles for mock staff sign-in (SSO is a later add-on; see ADR 0004).
BEGIN;

-- CreateEnum
CREATE TYPE "staff_role" AS ENUM ('approver', 'catalog_manager', 'support', 'finance', 'it_canvas_admin', 'staff_admin');

-- CreateTable
CREATE TABLE "staff_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "roles" "staff_role"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "auth_provider" TEXT NOT NULL DEFAULT 'mock',
    "external_subject" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_email_key" ON "staff_members"("email");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_auth_provider_external_subject_key" ON "staff_members"("auth_provider", "external_subject");

-- Not modeled by Prisma.
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_email_check"
  CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254);
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_roles_check"
  CHECK (cardinality(roles) >= 1);

-- Synthetic demo staff: one per role, plus an administrator holding every role.
INSERT INTO "staff_members" (email, display_name, roles) VALUES
  ('admin@cuce.test', 'Demo Staff Administrator', ARRAY['approver','catalog_manager','support','finance','it_canvas_admin','staff_admin']::staff_role[]),
  ('approver@cuce.test', 'Avery Approver', ARRAY['approver']::staff_role[]),
  ('catalog@cuce.test', 'Casey Catalog Manager', ARRAY['catalog_manager']::staff_role[]),
  ('support@cuce.test', 'Sam Support', ARRAY['support']::staff_role[]),
  ('finance@cuce.test', 'Fran Finance', ARRAY['finance']::staff_role[]),
  ('canvas@cuce.test', 'Ivy IT and Canvas Administrator', ARRAY['it_canvas_admin']::staff_role[]);

COMMIT;
