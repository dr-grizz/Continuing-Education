-- Add the content editor staff role (decision F2, October 7, 2026).
-- Kept alone and without BEGIN/COMMIT: a new enum value cannot be used in the same
-- transaction that adds it, so the demo seed follows in 5_content_editor_demo.
ALTER TYPE "staff_role" ADD VALUE IF NOT EXISTS 'content_editor';
