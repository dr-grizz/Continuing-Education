CREATE TABLE offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL,
  category text NOT NULL, summary text NOT NULL, description text NOT NULL,
  outcomes jsonb NOT NULL DEFAULT '[]', format text NOT NULL,
  start_date date NOT NULL, end_date date NOT NULL CHECK (end_date >= start_date),
  price_cents integer NOT NULL CHECK (price_cents >= 0), capacity integer NOT NULL CHECK (capacity > 0),
  approval_required boolean NOT NULL DEFAULT false, published boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), learner_id uuid NOT NULL,
  offering_id uuid NOT NULL REFERENCES offerings(id),
  status text NOT NULL CHECK (status IN ('awaiting_approval','approved','declined','reserved','provisioning','enrolled','expired','exception')),
  reserved_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learner_id, offering_id)
);
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entitlement_id uuid NOT NULL UNIQUE REFERENCES entitlements(id),
  amount_cents integer NOT NULL, payment_status text NOT NULL DEFAULT 'simulated_paid', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entitlement_id uuid NOT NULL UNIQUE REFERENCES entitlements(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','succeeded','failed')),
  stage text NOT NULL DEFAULT 'identity', next_run timestamptz DEFAULT now(),
  error text, created_at timestamptz DEFAULT now()
);
CREATE TABLE commands (
  actor text NOT NULL, key text NOT NULL, fingerprint text NOT NULL,
  response jsonb NOT NULL, PRIMARY KEY(actor,key)
);
CREATE TABLE audit_events (
  id bigserial PRIMARY KEY, actor text NOT NULL, action text NOT NULL, object_id uuid,
  details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO offerings(id,title,category,summary,description,outcomes,format,start_date,end_date,price_cents,capacity,approval_required,published) VALUES
('10000000-0000-4000-8000-000000000001','Practical Data Analysis','Technology','Turn spreadsheet data into clear, useful decisions.','Build a repeatable approach to cleaning, analyzing and presenting data. Work through guided exercises using realistic sample datasets. No programming experience is required.','["Clean and organize a dataset","Choose useful summaries and charts","Communicate findings with evidence"]','Online · self-paced','2026-11-02','2026-12-11',14900,24,false,true),
('10000000-0000-4000-8000-000000000002','Leading Effective Teams','Leadership','Develop everyday habits for communication and collaboration.','Explore how to set expectations, give useful feedback and guide a team through change. Short case studies connect each topic to everyday leadership decisions.','["Set clear team expectations","Practice constructive feedback","Plan for organizational change"]','Online · instructor-led','2026-11-09','2026-12-04',19900,18,false,true),
('10000000-0000-4000-8000-000000000003','Healthcare Communication','Healthcare','Practice clear, compassionate communication in care settings.','Review communication practices for healthcare teams through discussion and applied scenarios. This sample offering requires program approval before registration.','["Recognize communication barriers","Practice patient-centered language","Support effective team handoffs"]','Online · instructor-led','2026-11-16','2026-12-18',22500,16,true,true),
('10000000-0000-4000-8000-000000000004','Foundations of Biblical Study','Ministry','Build a thoughtful approach to reading and interpreting Scripture.','Develop foundational study practices through guided readings and discussion. Explore literary context, observation and interpretation in a structured learning experience.','["Identify literary and historical context","Apply careful observation","Develop a structured study plan"]','Online · self-paced','2026-11-02','2026-12-18',9900,30,false,true),
('10000000-0000-4000-8000-000000000005','Responsible AI at Work','Technology','Evaluate AI tools and use them with sound judgment.','Explore practical uses of AI alongside accuracy, confidentiality and human oversight. Complete guided activities that help you evaluate a tool before using it in your work.','["Evaluate an AI-generated result","Recognize confidentiality risks","Design a workflow with human review"]','Online · self-paced','2026-11-23','2026-12-18',12900,20,false,true),
('10000000-0000-4000-8000-000000000006','Project Planning Essentials','Leadership','Move from a project idea to a usable delivery plan.','Practice defining scope, assigning responsibilities and tracking dependencies. Build a manageable plan using straightforward project management methods.','["Define scope and deliverables","Identify dependencies and owners","Monitor progress and adjust a plan"]','Online · instructor-led','2026-12-01','2026-12-18',17500,20,false,false);
