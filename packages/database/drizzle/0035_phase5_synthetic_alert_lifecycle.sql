-- Phase 5 engineering-only alert records; aggregate counts, never clinical content.
-- The API hard-disables this workflow in production.
CREATE TABLE phase5_operational_alerts (
  code varchar(40) PRIMARY KEY
    CHECK (code IN ('custody_incidents','outbox_dead_letters','result_email_failures')),
  status varchar(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','acknowledged','resolved')),
  observed_count integer NOT NULL CHECK (observed_count >= 0),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid REFERENCES users(id),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  CONSTRAINT phase5_alert_ack_pair CHECK (
    (acknowledged_by IS NULL)=(acknowledged_at IS NULL)),
  CONSTRAINT phase5_alert_resolution CHECK (
    (status='resolved')=(resolved_at IS NOT NULL)),
  CONSTRAINT phase5_alert_active_count CHECK (
    status='resolved' OR observed_count > 0)
);
CREATE INDEX phase5_alert_queue_idx
 ON phase5_operational_alerts(status,last_seen_at);
CREATE FUNCTION phase5_guard_alert_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.code IS DISTINCT FROM OLD.code OR
    NEW.first_seen_at IS DISTINCT FROM OLD.first_seen_at THEN
   RAISE EXCEPTION 'Alert identity is immutable';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER phase5_alert_identity_guard
 BEFORE UPDATE ON phase5_operational_alerts
 FOR EACH ROW EXECUTE FUNCTION phase5_guard_alert_identity();
CREATE TRIGGER phase5_alert_no_delete
 BEFORE DELETE ON phase5_operational_alerts
 FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();
