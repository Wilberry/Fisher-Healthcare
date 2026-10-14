-- Phase 1 integrity hardening; apply only after 0000_foundation.sql.
-- Explicitly reject negative balances, malformed relationships, and missing result release attribution.
ALTER TABLE "patient_relationships"
 ADD CONSTRAINT "relationship_verified_before_grant" CHECK ((NOT can_book AND NOT can_view_results) OR (verified_at IS NOT NULL AND revoked_at IS NULL));
ALTER TABLE "results"
 ADD CONSTRAINT "results_release_actor_required" CHECK ((released_at IS NULL AND released_by IS NULL) OR (released_at IS NOT NULL AND released_by IS NOT NULL));
ALTER TABLE "orders"
 ADD CONSTRAINT "order_collection_window_order" CHECK (collection_window_start IS NULL OR collection_window_end IS NULL OR collection_window_end > collection_window_start);
ALTER TABLE "payments"
 ADD CONSTRAINT "payment_status_allowed" CHECK (status IN ('pending','verified','failed','refunded','partially_refunded'));
ALTER TABLE "outbox"
 ADD CONSTRAINT "outbox_attempts_nonnegative" CHECK (attempts >= 0);
CREATE INDEX IF NOT EXISTS "outbox_pending_idx" ON "outbox" ("created_at") WHERE "processed_at" IS NULL;
-- Append-only custody and audit event protection for application database role.
CREATE OR REPLACE FUNCTION reject_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'append-only event table cannot be modified';
END; $$;
CREATE TRIGGER custody_events_immutable BEFORE UPDATE OR DELETE ON custody_events FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();
