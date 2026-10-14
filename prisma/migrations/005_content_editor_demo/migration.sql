-- Demo content editor, and give the all-roles demo administrator the new role.
BEGIN;

INSERT INTO "staff_members" (email, display_name, roles)
VALUES ('content@cuce.test', 'Cory Content Editor', ARRAY['content_editor']::staff_role[])
ON CONFLICT (email) DO NOTHING;

UPDATE "staff_members"
  SET roles = array_append(roles, 'content_editor'::staff_role), version = version + 1
  WHERE email = 'admin@cuce.test' AND NOT ('content_editor'::staff_role = ANY (roles));

COMMIT;
