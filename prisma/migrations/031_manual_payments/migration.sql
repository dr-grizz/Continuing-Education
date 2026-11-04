BEGIN;
CREATE TABLE manual_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 learner_id uuid NOT NULL REFERENCES learners(id), offering_id uuid NOT NULL REFERENCES offerings(id),
 amount_cents integer NOT NULL CHECK(amount_cents>0), paid_on date NOT NULL,
 method text NOT NULL CHECK(method IN ('cash','check','bank_transfer','other')),
 reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 120),
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 1000),
 recorded_by text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX manual_payment_reference ON manual_payments(method,lower(trim(reference)));
CREATE INDEX manual_payment_date ON manual_payments(paid_on,offering_id);
CREATE TABLE manual_refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL REFERENCES manual_payments(id),
 amount_cents integer NOT NULL CHECK(amount_cents>0), refunded_on date NOT NULL,
 reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 120),
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 3 AND 1000),
 recorded_by text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX manual_refund_reference ON manual_refunds(lower(trim(reference)));
CREATE INDEX manual_refund_payment ON manual_refunds(payment_id);
-- Refund inserts serialize on the payment even outside the API; totals cannot exceed receipts.
CREATE FUNCTION validate_manual_refund() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payment manual_payments%ROWTYPE; refunded bigint;
BEGIN
 SELECT * INTO payment FROM manual_payments WHERE id=NEW.payment_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Manual payment not found'; END IF;
 SELECT coalesce(sum(amount_cents),0) INTO refunded FROM manual_refunds WHERE payment_id=NEW.payment_id;
 IF refunded+NEW.amount_cents>payment.amount_cents OR NEW.refunded_on<payment.paid_on THEN
  RAISE EXCEPTION 'Refund exceeds remaining payment or precedes payment';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER manual_refund_limits BEFORE INSERT ON manual_refunds FOR EACH ROW EXECUTE FUNCTION validate_manual_refund();
CREATE FUNCTION preserve_manual_financial_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Manual financial records are append-only'; END $$;
CREATE TRIGGER manual_payment_immutable BEFORE UPDATE OR DELETE ON manual_payments FOR EACH ROW EXECUTE FUNCTION preserve_manual_financial_record();
CREATE TRIGGER manual_refund_immutable BEFORE UPDATE OR DELETE ON manual_refunds FOR EACH ROW EXECUTE FUNCTION preserve_manual_financial_record();
COMMIT;
