-- Phase 3: version-fenced, idempotent field assignment lifecycle.
ALTER TABLE phase3_assignments
 ADD COLUMN event_version integer NOT NULL DEFAULT 0 CHECK (event_version >= 0),
 ADD COLUMN last_updated_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN failure_reason_code varchar(32),
 ADD CONSTRAINT phase3_failed_reason_required CHECK (
   (status = 'failed' AND failure_reason_code IN
     ('patient_unavailable','location_inaccessible','collection_not_safe','staff_unavailable','other'))
   OR (status <> 'failed' AND failure_reason_code IS NULL)
 );
CREATE TABLE phase3_assignment_event_receipts (
 event_id uuid PRIMARY KEY,
 assignment_id uuid NOT NULL REFERENCES phase3_assignments(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 action varchar(24) NOT NULL CHECK(action IN ('arrive','start_collection','fail')),
 fingerprint char(64) NOT NULL,
 receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX phase3_assignment_events_by_assignment ON phase3_assignment_event_receipts(assignment_id,created_at);
CREATE TRIGGER phase3_assignment_receipts_immutable
 BEFORE UPDATE OR DELETE ON phase3_assignment_event_receipts
 FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();
