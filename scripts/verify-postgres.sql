-- Executed only against a disposable foundation test database. Changes are rolled back.
BEGIN;
DO $verify$
DECLARE
  synthetic_user uuid;
  synthetic_patient uuid;
  synthetic_audit uuid;
  check_failed boolean := false;
BEGIN
  IF (SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
      AND table_type='BASE TABLE') <> 17 THEN
    RAISE EXCEPTION 'Unexpected Fisher schema table count';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='results_order_patient_match') THEN
    RAISE EXCEPTION 'Missing order/patient consistency foreign key';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='audit_events_immutable' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Missing append-only audit trigger';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='custody_events_immutable' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Missing append-only custody trigger';
  END IF;

  INSERT INTO users(identity_subject) VALUES('synthetic-schema-verification')
    RETURNING id INTO synthetic_user;
  INSERT INTO patients(display_name) VALUES('Synthetic Schema Test')
    RETURNING id INTO synthetic_patient;

  BEGIN
    INSERT INTO patient_relationships(user_id,patient_id,relationship,can_book)
      VALUES(synthetic_user,synthetic_patient,'test',true);
  EXCEPTION WHEN check_violation THEN
    check_failed := true;
  END;
  IF NOT check_failed THEN RAISE EXCEPTION 'Unverified caregiver grant was permitted'; END IF;

  INSERT INTO audit_events(actor_id,action,resource_type)
    VALUES(synthetic_user,'foundation.test','synthetic') RETURNING id INTO synthetic_audit;
  BEGIN
    UPDATE audit_events SET action='mutated' WHERE id=synthetic_audit;
    RAISE EXCEPTION 'AUDIT_UPDATE_WAS_ALLOWED';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'append-only event table cannot be modified' THEN RAISE; END IF;
  END;
END $verify$;
ROLLBACK;
