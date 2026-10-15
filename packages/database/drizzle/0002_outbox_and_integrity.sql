-- Add durable, fenced work claims. Forward-only migration for a disposable/staged database.
ALTER TABLE outbox
 ADD COLUMN available_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN lease_token uuid,
 ADD COLUMN lease_expires_at timestamptz,
 ADD COLUMN last_error text,
 ADD COLUMN dead_lettered_at timestamptz;
ALTER TABLE outbox
 ADD CONSTRAINT outbox_lease_pair CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
 ADD CONSTRAINT outbox_terminal_state CHECK (processed_at IS NULL OR dead_lettered_at IS NULL);
CREATE INDEX outbox_claimable_idx ON outbox(available_at, created_at)
 WHERE processed_at IS NULL AND dead_lettered_at IS NULL;
CREATE INDEX relationships_active_lookup_idx ON patient_relationships(user_id,patient_id)
 WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX results_order_patient_pair_unique ON orders(id,patient_id);
ALTER TABLE results
 ADD CONSTRAINT results_order_patient_match FOREIGN KEY (order_id,patient_id)
 REFERENCES orders(id,patient_id);
-- Protect direct table reads with database permissions in production; API uses a dedicated least-privilege role.
-- Service-level authorization must still verify OIDC issuer/subject and the current relationship state.
