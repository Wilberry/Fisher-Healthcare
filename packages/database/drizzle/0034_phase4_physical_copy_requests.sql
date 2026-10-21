-- Phase 4 optional physical-copy add-on: request and quote ONLY.
-- No payment collection, courier dispatch or handoff is authorized here.
CREATE TABLE phase4_physical_copy_requests(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key uuid NOT NULL UNIQUE,
  result_id uuid NOT NULL REFERENCES results(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  address_id uuid NOT NULL REFERENCES patient_addresses(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  status varchar(16) NOT NULL DEFAULT 'requested'
    CHECK(status IN ('requested','quoted','cancelled')),
  quote_kobo integer CHECK(quote_kobo BETWEEN 1 AND 2000000),
  quoted_by uuid REFERENCES users(id),
  quoted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT phase4_physical_copy_quote_state CHECK(
    (status IN ('requested','cancelled') AND quote_kobo IS NULL
      AND quoted_by IS NULL AND quoted_at IS NULL)
    OR (status='quoted' AND quote_kobo IS NOT NULL
      AND quoted_by IS NOT NULL AND quoted_at IS NOT NULL)),
  CONSTRAINT phase4_physical_copy_separate_quote CHECK(
    quoted_by IS NULL OR quoted_by <> requested_by),
  UNIQUE(result_id,requested_by,address_id)
);
CREATE INDEX phase4_physical_copy_queue
  ON phase4_physical_copy_requests(status,created_at,id);

CREATE FUNCTION phase4_guard_physical_copy_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.request_key,NEW.result_id,NEW.patient_id,
    NEW.address_id,NEW.requested_by,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.request_key,OLD.result_id,OLD.patient_id,
    OLD.address_id,OLD.requested_by,OLD.created_at) THEN
    RAISE EXCEPTION 'Physical-copy request identity is immutable';
  END IF;
  IF OLD.status <> 'requested'
     OR NEW.status NOT IN ('quoted','cancelled') THEN
    RAISE EXCEPTION 'Physical-copy request cannot be re-opened or altered';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER phase4_physical_copy_state_guard
  BEFORE UPDATE ON phase4_physical_copy_requests
  FOR EACH ROW EXECUTE FUNCTION phase4_guard_physical_copy_update();
CREATE TRIGGER phase4_physical_copy_no_delete
  BEFORE DELETE ON phase4_physical_copy_requests
  FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();
