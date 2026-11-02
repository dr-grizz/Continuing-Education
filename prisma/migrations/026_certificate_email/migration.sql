BEGIN;
CREATE TABLE credential_email_settings (
 workspace TEXT PRIMARY KEY REFERENCES credential_workspaces(id),
 automatic INTEGER NOT NULL DEFAULT 0 CHECK(automatic IN (0,1)),
 mode TEXT NOT NULL DEFAULT 'attachment' CHECK(mode IN ('attachment','link','both')),
 subject TEXT NOT NULL DEFAULT 'Your certificate: {{achievement}}',
 message TEXT NOT NULL DEFAULT E'Hello {{name}},\n\nCongratulations on completing {{achievement}}. Your certificate is included below.\n\nContinuing Education\nCedarville University',
 revision INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL
);
CREATE TABLE credential_email_deliveries (
 workspace TEXT NOT NULL REFERENCES credential_workspaces(id),id TEXT NOT NULL,
 certificate_id TEXT NOT NULL,recipient TEXT NOT NULL,learner_id TEXT NOT NULL,
 batch_id TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('preview','queued','sending','accepted','failed','unknown','blocked','cancelled')),
 snapshot_json TEXT NOT NULL,resend_of TEXT,send_started_at TEXT,provider_id TEXT,
 PRIMARY KEY(workspace,id),
 FOREIGN KEY(workspace,certificate_id) REFERENCES credential_certificates(workspace,id),
 FOREIGN KEY(workspace,resend_of) REFERENCES credential_email_deliveries(workspace,id)
);
CREATE INDEX credential_email_duplicate ON credential_email_deliveries(workspace,certificate_id,recipient,created_at);
CREATE INDEX credential_email_queue ON credential_email_deliveries(workspace,state,created_at);
CREATE TABLE credential_email_events (
 workspace TEXT NOT NULL REFERENCES credential_workspaces(id),id TEXT NOT NULL,
 delivery_id TEXT NOT NULL,at TEXT NOT NULL,state TEXT NOT NULL,detail TEXT NOT NULL,actor TEXT NOT NULL,
 PRIMARY KEY(workspace,id),FOREIGN KEY(workspace,delivery_id) REFERENCES credential_email_deliveries(workspace,id)
);
CREATE FUNCTION credential_email_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Email history and reviewed content are immutable'; END; $$;
CREATE TRIGGER credential_email_event_history BEFORE UPDATE OR DELETE ON credential_email_events FOR EACH ROW EXECUTE FUNCTION credential_email_history_immutable();
CREATE FUNCTION credential_email_content_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.workspace IS DISTINCT FROM OLD.workspace OR NEW.id IS DISTINCT FROM OLD.id OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id OR NEW.recipient IS DISTINCT FROM OLD.recipient OR NEW.learner_id IS DISTINCT FROM OLD.learner_id OR NEW.batch_id IS DISTINCT FROM OLD.batch_id OR NEW.actor IS DISTINCT FROM OLD.actor OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.snapshot_json IS DISTINCT FROM OLD.snapshot_json OR NEW.resend_of IS DISTINCT FROM OLD.resend_of THEN
  RAISE EXCEPTION 'Reviewed email content is immutable';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER credential_email_content BEFORE UPDATE ON credential_email_deliveries FOR EACH ROW EXECUTE FUNCTION credential_email_content_immutable();
CREATE TRIGGER credential_email_no_delete BEFORE DELETE ON credential_email_deliveries FOR EACH ROW EXECUTE FUNCTION credential_email_history_immutable();
COMMIT;
