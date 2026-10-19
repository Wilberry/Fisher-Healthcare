-- Phase 3: immutable label verification before physical collection.
-- This is a barcode match only; staff must still follow approved patient ID SOPs.
CREATE TABLE phase3_specimen_label_checks (
 specimen_id uuid PRIMARY KEY REFERENCES specimens(id),
 event_id uuid NOT NULL UNIQUE,
 checked_by uuid NOT NULL REFERENCES users(id),
 expected_version integer NOT NULL CHECK (expected_version >= 0),
 barcode_fingerprint char(64) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX phase3_label_checks_actor ON phase3_specimen_label_checks(checked_by,created_at);
CREATE TRIGGER phase3_label_checks_immutable
 BEFORE UPDATE OR DELETE ON phase3_specimen_label_checks
 FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();
