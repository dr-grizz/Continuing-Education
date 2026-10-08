-- Baseline for Prisma Migrate (issue #2): the schema and synthetic seed produced by
-- legacy migrations 001-007 (src/domain/*.sql). Existing databases that applied those
-- migrations are marked as already applied (`prisma migrate resolve --applied 0_baseline`)
-- and never replay this file. Sections after the generated DDL are hand-written because
-- Prisma does not model CHECK constraints, functions or triggers.

-- CreateTable
CREATE TABLE "audit_events" (
    "id" BIGSERIAL NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "object_id" UUID,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commands" (
    "actor" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "response" JSONB NOT NULL,

    CONSTRAINT "commands_pkey" PRIMARY KEY ("actor","key")
);

-- CreateTable
CREATE TABLE "entitlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "learner_id" UUID NOT NULL,
    "offering_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "reserved_until" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "approval_expires_at" TIMESTAMPTZ,
    "quoted_price_cents" INTEGER,

    CONSTRAINT "entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learners" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "learners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offering_prices" (
    "id" BIGSERIAL NOT NULL,
    "offering_id" UUID NOT NULL,
    "price_cents" INTEGER NOT NULL,
    "effective_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "actor" TEXT NOT NULL,
    "reason" TEXT,

    CONSTRAINT "offering_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offerings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "outcomes" JSONB NOT NULL DEFAULT '[]',
    "format" TEXT NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "price_cents" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "approval_required" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "course_type" TEXT NOT NULL DEFAULT 'cohort',
    "approval_valid_days" INTEGER NOT NULL DEFAULT 7,
    "enrollment_close_days" INTEGER NOT NULL DEFAULT 7,
    "canvas_course_url" TEXT,
    "unpublished_at" TIMESTAMPTZ,

    CONSTRAINT "offerings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entitlement_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "stage" TEXT NOT NULL DEFAULT 'identity',
    "next_run" TIMESTAMPTZ DEFAULT now(),
    "error" TEXT,
    "created_at" TIMESTAMPTZ DEFAULT now(),
    "simulated_outcome" TEXT NOT NULL DEFAULT 'normal',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "delay_applied" BOOLEAN NOT NULL DEFAULT false,
    "failed_at" TIMESTAMPTZ,

    CONSTRAINT "operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entitlement_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "payment_status" TEXT NOT NULL DEFAULT 'simulated_paid',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prototype_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "prototype_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "schema_migrations" (
    "version" TEXT NOT NULL,
    "applied_at" TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT "schema_migrations_pkey" PRIMARY KEY ("version")
);

-- AddUniqueConstraint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_learner_id_offering_id_key" UNIQUE ("learner_id", "offering_id");

-- AddUniqueConstraint
ALTER TABLE "learners" ADD CONSTRAINT "learners_email_key" UNIQUE ("email");

-- CreateIndex
CREATE INDEX "offering_prices_offering" ON "offering_prices"("offering_id", "id");

-- AddUniqueConstraint
ALTER TABLE "operations" ADD CONSTRAINT "operations_entitlement_id_key" UNIQUE ("entitlement_id");

-- AddUniqueConstraint
ALTER TABLE "orders" ADD CONSTRAINT "orders_entitlement_id_key" UNIQUE ("entitlement_id");

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_learner_fk" FOREIGN KEY ("learner_id") REFERENCES "learners"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "offering_prices" ADD CONSTRAINT "offering_prices_offering_id_fkey" FOREIGN KEY ("offering_id") REFERENCES "offerings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "operations" ADD CONSTRAINT "operations_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "entitlements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_entitlement_id_fkey" FOREIGN KEY ("entitlement_id") REFERENCES "entitlements"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- CHECK constraints (not modeled by Prisma)
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_check" CHECK (end_date >= start_date);
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_price_cents_check" CHECK (price_cents >= 0);
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_capacity_check" CHECK (capacity > 0);
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_course_type_check" CHECK (course_type IN ('cohort', 'self_paced'));
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_schedule_check" CHECK (
  (course_type = 'cohort' AND start_date IS NOT NULL AND end_date IS NOT NULL AND end_date >= start_date)
  OR (course_type = 'self_paced' AND start_date IS NULL AND end_date IS NULL));
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_approval_valid_days_check" CHECK (approval_valid_days BETWEEN 1 AND 365);
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_enrollment_close_days_check" CHECK (enrollment_close_days BETWEEN 0 AND 365);
ALTER TABLE "offerings" ADD CONSTRAINT "offerings_canvas_course_url_check" CHECK (canvas_course_url IS NULL OR canvas_course_url ~ '^https://[^[:space:]]+$');
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_status_check" CHECK (status IN (
  'awaiting_approval','approved','approval_expired','declined','reserved',
  'provisioning','enrolled','expired','exception'));
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_quoted_price_cents_check" CHECK (quoted_price_cents >= 0);
ALTER TABLE "operations" ADD CONSTRAINT "operations_status_check" CHECK (status IN ('pending','running','succeeded','failed'));
ALTER TABLE "operations" ADD CONSTRAINT "operations_simulated_outcome_check" CHECK (simulated_outcome IN ('normal','delayed','transient','identity_failure','canvas_failure'));
ALTER TABLE "operations" ADD CONSTRAINT "operations_attempts_check" CHECK (attempts >= 0);
ALTER TABLE "learners" ADD CONSTRAINT "learners_email_check" CHECK (email = lower(btrim(email)) AND length(email) BETWEEN 3 AND 254);
ALTER TABLE "offering_prices" ADD CONSTRAINT "offering_prices_price_cents_check" CHECK (price_cents >= 0);

-- Append-only price history (not modeled by Prisma)
CREATE FUNCTION offering_prices_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'offering_prices is append-only';
END
$$ LANGUAGE plpgsql;
CREATE TRIGGER offering_prices_no_update BEFORE UPDATE ON offering_prices
  FOR EACH ROW EXECUTE FUNCTION offering_prices_append_only();

-- Synthetic seed: the data migrations 001-007 leave in an empty database.
INSERT INTO offerings(id,title,category,summary,description,outcomes,format,course_type,start_date,end_date,price_cents,capacity,approval_required,published,canvas_course_url) VALUES
('10000000-0000-4000-8000-000000000001','Practical Data Analysis','Technology','Turn spreadsheet data into clear, useful decisions.','Build a repeatable approach to cleaning, analyzing and presenting data. Work through guided exercises using realistic sample datasets. No programming experience is required.','["Clean and organize a dataset","Choose useful summaries and charts","Communicate findings with evidence"]','Online · self-paced','self_paced',NULL,NULL,14900,24,false,true,'https://canvas.example.edu/courses/0001'),
('10000000-0000-4000-8000-000000000002','Leading Effective Teams','Leadership','Develop everyday habits for communication and collaboration.','Explore how to set expectations, give useful feedback and guide a team through change. Short case studies connect each topic to everyday leadership decisions.','["Set clear team expectations","Practice constructive feedback","Plan for organizational change"]','Online · instructor-led','cohort','2026-11-09','2026-12-04',19900,18,false,true,'https://canvas.example.edu/courses/0002'),
('10000000-0000-4000-8000-000000000003','Healthcare Communication','Healthcare','Practice clear, compassionate communication in care settings.','Review communication practices for healthcare teams through discussion and applied scenarios. This sample offering requires program approval before registration.','["Recognize communication barriers","Practice patient-centered language","Support effective team handoffs"]','Online · instructor-led','cohort','2026-11-16','2026-12-18',22500,16,true,true,'https://canvas.example.edu/courses/0003'),
('10000000-0000-4000-8000-000000000004','Foundations of Biblical Study','Ministry','Build a thoughtful approach to reading and interpreting Scripture.','Develop foundational study practices through guided readings and discussion. Explore literary context, observation and interpretation in a structured learning experience.','["Identify literary and historical context","Apply careful observation","Develop a structured study plan"]','Online · self-paced','self_paced',NULL,NULL,9900,30,false,true,'https://canvas.example.edu/courses/0004'),
('10000000-0000-4000-8000-000000000005','Responsible AI at Work','Technology','Evaluate AI tools and use them with sound judgment.','Explore practical uses of AI alongside accuracy, confidentiality and human oversight. Complete guided activities that help you evaluate a tool before using it in your work.','["Evaluate an AI-generated result","Recognize confidentiality risks","Design a workflow with human review"]','Online · self-paced','self_paced',NULL,NULL,12900,20,false,true,'https://canvas.example.edu/courses/0005'),
('10000000-0000-4000-8000-000000000006','Project Planning Essentials','Leadership','Move from a project idea to a usable delivery plan.','Practice defining scope, assigning responsibilities and tracking dependencies. Build a manageable plan using straightforward project management methods.','["Define scope and deliverables","Identify dependencies and owners","Monitor progress and adjust a plan"]','Online · instructor-led','cohort','2026-12-01','2026-12-18',17500,20,false,false,'https://canvas.example.edu/courses/0006');
-- Legacy email-less learner that owns shared sample registrations (migration 003).
INSERT INTO learners(id) VALUES ('00000000-0000-4000-8000-000000000001');
INSERT INTO prototype_settings(key, value) VALUES ('provisioning_outcome', 'normal');
INSERT INTO offering_prices(offering_id, price_cents, effective_at, actor, reason)
  SELECT id, price_cents, created_at, 'migration', 'Price at time of migration' FROM offerings ORDER BY id;
