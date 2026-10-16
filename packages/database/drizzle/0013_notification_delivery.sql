-- Durable, fenced staging email dispatch; never infer a sent receipt.
ALTER TABLE notification_intents
  ADD COLUMN attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
  ADD COLUMN lease_token uuid,
  ADD COLUMN lease_expires_at timestamptz,
  ADD COLUMN first_attempt_at timestamptz,
  ADD COLUMN last_attempt_at timestamptz;
ALTER TABLE notification_intents ADD CONSTRAINT notification_lease_pair
 CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL));
CREATE INDEX notification_dispatch_due ON notification_intents(status,lease_expires_at)
 WHERE status IN ('pending','sending');
