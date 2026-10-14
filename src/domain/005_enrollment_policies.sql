-- Per-offering policies staff can change (decisions recorded October 6, 2026).
ALTER TABLE offerings
  ADD COLUMN approval_valid_days integer NOT NULL DEFAULT 7
    CHECK (approval_valid_days BETWEEN 1 AND 365),
  -- Scheduled courses close enrollment this many days after the start date.
  ADD COLUMN enrollment_close_days integer NOT NULL DEFAULT 7
    CHECK (enrollment_close_days BETWEEN 0 AND 365),
  ADD COLUMN canvas_course_url text
    CHECK (canvas_course_url IS NULL OR canvas_course_url ~ '^https://[^[:space:]]+$');

ALTER TABLE entitlements ADD COLUMN approval_expires_at timestamptz;
ALTER TABLE entitlements DROP CONSTRAINT entitlements_status_check;
ALTER TABLE entitlements ADD CONSTRAINT entitlements_status_check CHECK (status IN (
  'awaiting_approval','approved','approval_expired','declined','reserved',
  'provisioning','enrolled','expired','exception'));

-- Approvals granted before this policy get a fresh validity period rather than lapsing at once.
UPDATE entitlements e SET approval_expires_at = now() + make_interval(days => o.approval_valid_days)
  FROM offerings o
  WHERE o.id = e.offering_id AND o.approval_required AND e.status IN ('approved','reserved','expired');

-- Placeholder Canvas links for the synthetic sample offerings; never a production Canvas host.
UPDATE offerings SET canvas_course_url = 'https://canvas.example.edu/courses/' || right(id::text, 4)
  WHERE id::text LIKE '10000000-0000-4000-8000-%';
