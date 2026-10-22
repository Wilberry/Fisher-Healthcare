-- Refund approval is not a provider refund. No external transfers or ledger postings occur.
-- Database balance protection is enforced by a payment-row lock in the service.
CREATE TABLE phase4_refund_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL UNIQUE,
  payment_id uuid NOT NULL REFERENCES payments(id),
  amount_kobo integer NOT NULL CHECK(amount_kobo > 0),
  reason_code varchar(40) NOT NULL CHECK(reason_code IN (
    'cancelled_service','failed_collection','lab_rejection','duplicate_charge','manual_review')),
  requested_by uuid NOT NULL REFERENCES users(id),
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_note varchar(240),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT phase4_refund_review_consistency CHECK(
    (status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_note IS NULL)
    OR (status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND char_length(btrim(review_note)) BETWEEN 10 AND 240)),
  CONSTRAINT phase4_refund_distinct_approver CHECK(requested_by<>reviewed_by)
);
CREATE INDEX phase4_refunds_payment ON phase4_refund_requests(payment_id,status,created_at);
CREATE TRIGGER phase4_refund_requests_no_delete
  BEFORE DELETE ON phase4_refund_requests FOR EACH ROW
  EXECUTE FUNCTION reject_event_mutation();
