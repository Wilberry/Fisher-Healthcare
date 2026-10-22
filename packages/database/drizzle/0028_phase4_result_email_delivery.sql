-- Synthetic-only, PHI-free result availability notifications.
-- The worker independently checks release, patient relationship and email identity.
ALTER TABLE phase4_result_delivery_intents
  DROP CONSTRAINT phase4_result_delivery_intents_status_check;
ALTER TABLE phase4_result_delivery_intents
  ADD CONSTRAINT phase4_delivery_status CHECK(status IN ('pending','sending','delivered','failed')),
  ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN first_attempt_at timestamptz,
  ADD COLUMN last_attempt_at timestamptz,
  ADD COLUMN lease_token uuid,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN recipient_email varchar(320),
  ADD COLUMN provider_receipt varchar(128),
  ADD COLUMN delivered_at timestamptz,
  ADD CONSTRAINT phase4_delivery_lease_pair
    CHECK((lease_token IS NULL)=(lease_expires_at IS NULL)),
  ADD CONSTRAINT phase4_delivery_receipt_consistent
    CHECK((status='delivered' AND provider_receipt IS NOT NULL AND delivered_at IS NOT NULL)
      OR (status<>'delivered' AND delivered_at IS NULL));
CREATE INDEX phase4_result_delivery_due
  ON phase4_result_delivery_intents(next_attempt_at,lease_expires_at)
  WHERE status IN ('pending','sending');
