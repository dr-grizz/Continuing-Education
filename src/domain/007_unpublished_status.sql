-- Distinguish an unpublished offering from a draft that was never published.
ALTER TABLE offerings ADD COLUMN unpublished_at timestamptz;
UPDATE offerings o SET unpublished_at = a.created_at
  FROM (SELECT object_id, max(created_at) AS created_at FROM audit_events
        WHERE action = 'offering.unpublished' GROUP BY object_id) a
  WHERE a.object_id = o.id AND NOT o.published;
