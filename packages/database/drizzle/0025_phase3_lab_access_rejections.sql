-- Phase 3: explicitly reject pending internal lab grants without authorizing any access.
-- Approval remains a separate second-administrator decision.
ALTER TABLE phase3_lab_access_requests
  DROP CONSTRAINT phase3_lab_access_requests_status_check,
  DROP CONSTRAINT phase3_lab_access_review_state;
ALTER TABLE phase3_lab_access_requests
  ADD COLUMN review_note varchar(240),
  ADD CONSTRAINT phase3_lab_access_request_status
    CHECK(status IN ('pending','approved','rejected')),
  ADD CONSTRAINT phase3_lab_access_review_state
    CHECK((status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
      OR (status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  ADD CONSTRAINT phase3_lab_access_rejection_note
    CHECK((status='rejected' AND char_length(btrim(review_note)) BETWEEN 10 AND 240)
      OR (status <> 'rejected' AND review_note IS NULL));
