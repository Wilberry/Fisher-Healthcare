-- Phase 4: preserve immutable finance identity and monetary evidence.
-- Only the documented decision and assignment transitions can update rows.
-- This migration remains synthetic-only; it does not execute money movement.

CREATE FUNCTION phase4_guard_refund_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.request_key,NEW.payment_id,NEW.amount_kobo,
      NEW.reason_code,NEW.requested_by,NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id,OLD.request_key,OLD.payment_id,OLD.amount_kobo,
      OLD.reason_code,OLD.requested_by,OLD.created_at) THEN
    RAISE EXCEPTION 'Refund evidence fields are immutable';
  END IF;
  IF OLD.status <> 'pending' OR NEW.status NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Refund decision transition denied';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER phase4_refund_immutable_fields
  BEFORE UPDATE ON phase4_refund_requests
  FOR EACH ROW EXECUTE FUNCTION phase4_guard_refund_update();

CREATE FUNCTION phase4_guard_batch_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.batch_key,NEW.lab_id,NEW.requested_by,
      NEW.total_kobo,NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id,OLD.batch_key,OLD.lab_id,OLD.requested_by,
      OLD.total_kobo,OLD.created_at) THEN
    RAISE EXCEPTION 'Settlement amount and identity are immutable';
  END IF;
  IF OLD.status <> 'pending' OR NEW.status NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Settlement decision transition denied';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER phase4_lab_batch_immutable_fields
  BEFORE UPDATE ON phase4_lab_settlement_batches
  FOR EACH ROW EXECUTE FUNCTION phase4_guard_batch_update();

CREATE FUNCTION phase4_guard_payable_update() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  batch_status varchar(16);
  batch_lab uuid;
BEGIN
  IF ROW(NEW.id,NEW.result_id,NEW.lab_id,NEW.amount_kobo,
      NEW.agreement_reference,NEW.entered_by,NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id,OLD.result_id,OLD.lab_id,OLD.amount_kobo,
      OLD.agreement_reference,OLD.entered_by,OLD.created_at) THEN
    RAISE EXCEPTION 'Laboratory payable amount and source are immutable';
  END IF;
  IF OLD.assigned_batch IS NULL AND NEW.assigned_batch IS NOT NULL THEN
    SELECT status,lab_id INTO batch_status,batch_lab
      FROM phase4_lab_settlement_batches WHERE id=NEW.assigned_batch;
    IF batch_status IS DISTINCT FROM 'pending' OR batch_lab IS DISTINCT FROM NEW.lab_id
       OR NOT EXISTS (
         SELECT 1 FROM phase4_lab_settlement_items
         WHERE batch_id=NEW.assigned_batch AND payable_id=NEW.id
       ) THEN
      RAISE EXCEPTION 'Invalid payable assignment';
    END IF;
  ELSIF OLD.assigned_batch IS NOT NULL AND NEW.assigned_batch IS NULL THEN
    SELECT status INTO batch_status FROM phase4_lab_settlement_batches
      WHERE id=OLD.assigned_batch;
    IF batch_status IS DISTINCT FROM 'rejected' THEN
      RAISE EXCEPTION 'Only a rejected batch may release a payable';
    END IF;
  ELSE
    RAISE EXCEPTION 'Payable assignment transition denied';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER phase4_lab_payable_immutable_fields
  BEFORE UPDATE ON phase4_lab_payables
  FOR EACH ROW EXECUTE FUNCTION phase4_guard_payable_update();
