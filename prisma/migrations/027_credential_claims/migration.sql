BEGIN;
CREATE TABLE credential_claims (
 workspace TEXT NOT NULL REFERENCES credential_workspaces(id),id TEXT NOT NULL,
 source_id TEXT NOT NULL,badge_id TEXT NOT NULL,learner TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('badge','certificate','both')),
 certificate_id TEXT,code_hash TEXT NOT NULL,origin TEXT NOT NULL,
 created_at TEXT NOT NULL,expires_at TEXT NOT NULL,created_by TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','claimed','revoked')),
 claimed_at TEXT,claimed_by TEXT,revoked_at TEXT,revoked_by TEXT,
 PRIMARY KEY(workspace,id),UNIQUE(workspace,code_hash),
 FOREIGN KEY(workspace,certificate_id) REFERENCES credential_certificates(workspace,id),
 CHECK((kind='badge' AND certificate_id IS NULL) OR (kind IN ('certificate','both') AND certificate_id IS NOT NULL)),
 CHECK((claimed_at IS NULL AND claimed_by IS NULL) OR (claimed_at IS NOT NULL AND claimed_by=learner)),
 CHECK(state<>'claimed' OR claimed_at IS NOT NULL)
);
CREATE INDEX credential_claim_lookup ON credential_claims(workspace,source_id,badge_id,kind,created_at);
CREATE TABLE credential_claim_events (
 workspace TEXT NOT NULL REFERENCES credential_workspaces(id),id TEXT NOT NULL,
 claim_id TEXT,at TEXT NOT NULL,action TEXT NOT NULL,actor TEXT NOT NULL,
 PRIMARY KEY(workspace,id),FOREIGN KEY(workspace,claim_id) REFERENCES credential_claims(workspace,id)
);
CREATE INDEX credential_claim_attempts ON credential_claim_events(workspace,actor,at);
CREATE FUNCTION credential_claim_content_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.workspace IS DISTINCT FROM OLD.workspace OR NEW.id IS DISTINCT FROM OLD.id OR NEW.source_id IS DISTINCT FROM OLD.source_id OR NEW.badge_id IS DISTINCT FROM OLD.badge_id OR NEW.learner IS DISTINCT FROM OLD.learner OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.certificate_id IS DISTINCT FROM OLD.certificate_id OR NEW.code_hash IS DISTINCT FROM OLD.code_hash OR NEW.origin IS DISTINCT FROM OLD.origin OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
  RAISE EXCEPTION 'Claim recipient and distribution content are immutable';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER credential_claim_content BEFORE UPDATE ON credential_claims FOR EACH ROW EXECUTE FUNCTION credential_claim_content_immutable();
CREATE TRIGGER credential_claim_no_delete BEFORE DELETE ON credential_claims FOR EACH ROW EXECUTE FUNCTION credential_email_history_immutable();
CREATE TRIGGER credential_claim_event_history BEFORE UPDATE OR DELETE ON credential_claim_events FOR EACH ROW EXECUTE FUNCTION credential_email_history_immutable();
COMMIT;
