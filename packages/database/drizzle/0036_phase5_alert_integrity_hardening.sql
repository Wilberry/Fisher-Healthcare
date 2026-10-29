-- Forward-only Phase 5 synthetic alert decision hardening.
-- Preserve checksums of previous migrations and existing append-only history.
CREATE OR REPLACE FUNCTION phase5_guard_alert_identity() RETURNS trigger LANGUAGE plpgsql AS $phase5$
BEGIN
 IF NEW.code IS DISTINCT FROM OLD.code OR
    NEW.first_seen_at IS DISTINCT FROM OLD.first_seen_at THEN
   RAISE EXCEPTION 'Alert identity is immutable';
 END IF;
 IF NOT (
    OLD.status=NEW.status OR
    (OLD.status='open' AND NEW.status IN ('acknowledged','resolved')) OR
    (OLD.status='acknowledged' AND NEW.status='resolved') OR
    (OLD.status='resolved' AND NEW.status='open')
 ) THEN
   RAISE EXCEPTION 'Invalid synthetic alert transition';
 END IF;
 IF NEW.last_seen_at < OLD.last_seen_at OR
    NEW.last_seen_at < NEW.first_seen_at OR
    (NEW.acknowledged_at IS NOT NULL AND NEW.acknowledged_at < NEW.first_seen_at) OR
    (NEW.resolved_at IS NOT NULL AND NEW.resolved_at < NEW.first_seen_at) THEN
   RAISE EXCEPTION 'Alert chronology cannot move backward';
 END IF;
 -- Once acknowledged, the identity and original timestamp cannot be
 -- replaced during resolution or any same-status update.
 IF OLD.status='acknowledged' AND NEW.status IN ('acknowledged','resolved')
   AND (NEW.acknowledged_by IS DISTINCT FROM OLD.acknowledged_by OR
        NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at) THEN
   RAISE EXCEPTION 'Acknowledgment cannot be rewritten';
 END IF;
 IF OLD.status='open' AND NEW.status='resolved' AND
    (NEW.acknowledged_by IS NOT NULL OR NEW.acknowledged_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Unacknowledged alert cannot gain a resolved actor';
 END IF;
 IF OLD.status='resolved' AND NEW.status='resolved' AND (
    NEW.acknowledged_by IS DISTINCT FROM OLD.acknowledged_by OR
    NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at OR
    NEW.resolved_at IS DISTINCT FROM OLD.resolved_at) THEN
   RAISE EXCEPTION 'Resolved alert decision cannot be rewritten';
 END IF;
 IF OLD.status='resolved' AND NEW.status='open' AND
    (NEW.acknowledged_by IS NOT NULL OR NEW.acknowledged_at IS NOT NULL OR
     NEW.resolved_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Reopened alert must clear historical decision';
 END IF;
 RETURN NEW;
END;
$phase5$;

-- State-event taxonomy is private and finite: a resolved event must report
-- zero active count, whereas opened/reopened/acknowledged must have a signal.
ALTER TABLE phase5_alert_state_events
  ADD CONSTRAINT phase5_alert_event_count_consistency
  CHECK (
    (event_type='resolved' AND observed_count=0) OR
    (event_type IN ('opened','reopened','acknowledged') AND observed_count>0)
  );
