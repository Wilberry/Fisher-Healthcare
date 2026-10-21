-- Phase 4: the source and release identity of a diagnostic result cannot
-- be rewritten after it has been recorded for an ordered test.
-- Older non-Phase-4 result rows retain their existing application behavior.
CREATE FUNCTION phase4_guard_result_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  managed boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM phase4_result_intakes WHERE result_id=OLD.id
  ) INTO managed;
  IF NOT managed THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'Phase 4 diagnostic result cannot be deleted';
  END IF;
  IF ROW(NEW.id,NEW.order_id,NEW.patient_id,NEW.object_key,NEW.created_at)
     IS DISTINCT FROM
     ROW(OLD.id,OLD.order_id,OLD.patient_id,OLD.object_key,OLD.created_at) THEN
    RAISE EXCEPTION 'Phase 4 diagnostic result provenance cannot be changed';
  END IF;
  IF OLD.released_at IS NOT NULL THEN
    IF NEW.released_at IS DISTINCT FROM OLD.released_at
       OR NEW.released_by IS DISTINCT FROM OLD.released_by THEN
      RAISE EXCEPTION 'Released diagnostic result cannot be altered';
    END IF;
  ELSIF NEW.released_at IS NOT NULL AND NEW.released_by IS NOT NULL THEN
    -- One initial release is permitted. The application records the
    -- independent reviewer and release event in the same DB transaction.
    NULL;
  ELSIF NEW.released_at IS DISTINCT FROM OLD.released_at
     OR NEW.released_by IS DISTINCT FROM OLD.released_by THEN
    RAISE EXCEPTION 'Invalid diagnostic result release transition';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER phase4_results_immutable
  BEFORE UPDATE OR DELETE ON results
  FOR EACH ROW EXECUTE FUNCTION phase4_guard_result_mutation();
