-- Phase 3 internal lab coordinator grants require two distinct administrators.
-- A pending request does not authorize specimen receipt; only an approved,
-- current entry in phase3_lab_staff_access does.
CREATE TABLE phase3_lab_access_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lab_id uuid NOT NULL REFERENCES laboratories(id),
 staff_id uuid NOT NULL REFERENCES staff(id),
 requested_by uuid NOT NULL REFERENCES users(id),
 reason varchar(240) NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 240),
 status varchar(24) NOT NULL DEFAULT 'pending'
   CHECK (status IN ('pending','approved')),
 reviewed_by uuid REFERENCES users(id),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT phase3_lab_access_distinct_reviewer CHECK
   (reviewed_by IS NULL OR requested_by <> reviewed_by),
 CONSTRAINT phase3_lab_access_review_state CHECK
   ((status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status = 'approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX phase3_one_pending_lab_grant_request
 ON phase3_lab_access_requests(lab_id,staff_id) WHERE status='pending';
CREATE TRIGGER phase3_lab_access_requests_no_delete
 BEFORE DELETE ON phase3_lab_access_requests
 FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();
