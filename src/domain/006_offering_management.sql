-- Append-only price history: a published price is never edited in place.
CREATE TABLE offering_prices (
  id bigserial PRIMARY KEY,
  -- Rows disappear only when their (synthetic) offering is deleted.
  offering_id uuid NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  effective_at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  reason text
);
CREATE INDEX offering_prices_offering ON offering_prices(offering_id, id);
CREATE FUNCTION offering_prices_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'offering_prices is append-only';
END
$$ LANGUAGE plpgsql;
CREATE TRIGGER offering_prices_no_update BEFORE UPDATE ON offering_prices
  FOR EACH ROW EXECUTE FUNCTION offering_prices_append_only();
INSERT INTO offering_prices(offering_id, price_cents, effective_at, actor, reason)
  SELECT id, price_cents, created_at, 'migration', 'Price at time of migration' FROM offerings;

-- Each reservation keeps the price quoted when the seat was reserved.
ALTER TABLE entitlements ADD COLUMN quoted_price_cents integer CHECK (quoted_price_cents >= 0);
UPDATE entitlements e SET quoted_price_cents = o.price_cents
  FROM offerings o WHERE o.id = e.offering_id AND e.status = 'reserved';
