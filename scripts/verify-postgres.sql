-- Synthetic integrity acceptance executed against the disposable fisher_test database.
-- Every fixture and attempted mutation is inside one transaction and is rolled back.
BEGIN;

DO $phase1$
DECLARE
  actor_id uuid;
  patient_id uuid;
  other_patient_id uuid;
  lab_id uuid;
  order_id uuid;
  specimen_id uuid;
  event_id uuid;
  custody_id uuid;
  rejected boolean;
BEGIN
  IF current_database() <> 'fisher_test' THEN
    RAISE EXCEPTION 'Refusing Phase 1 synthetic checks outside fisher_test';
  END IF;
  IF (SELECT count(*) FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE') <> 17 THEN
    RAISE EXCEPTION 'Unexpected Phase 1 schema table count';
  END IF;
  IF (SELECT count(*) FROM fisher_migrations) <> 4 THEN
    RAISE EXCEPTION 'Incomplete verified migration history';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='results_order_patient_match') THEN
    RAISE EXCEPTION 'Result ownership FK missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='audit_events_immutable' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Audit immutability trigger missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='custody_events_immutable' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Custody immutability trigger missing';
  END IF;

  INSERT INTO users(identity_subject)
    VALUES ('synthetic-disposable-phase1-integrity')
    RETURNING id INTO actor_id;
  INSERT INTO patients(display_name)
    VALUES ('Synthetic Patient') RETURNING id INTO patient_id;
  INSERT INTO patients(display_name)
    VALUES ('Synthetic Unrelated Patient') RETURNING id INTO other_patient_id;
  INSERT INTO laboratories(name)
    VALUES ('Synthetic Verification Laboratory') RETURNING id INTO lab_id;
  INSERT INTO orders(patient_id,booked_by,lab_id,tier,total_kobo)
    VALUES (patient_id,actor_id,lab_id,'regular',0) RETURNING id INTO order_id;
  INSERT INTO specimens(order_id,barcode)
    VALUES (order_id,'SYNTHETIC-PHASE1-VERIFY') RETURNING id INTO specimen_id;

  rejected := false;
  BEGIN
    INSERT INTO patient_relationships(user_id,patient_id,relationship,can_book)
      VALUES(actor_id,patient_id,'test',true);
  EXCEPTION WHEN check_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Unverified booking authority was permitted'; END IF;

  rejected := false;
  BEGIN
    INSERT INTO results(order_id,patient_id,object_key)
      VALUES(order_id,other_patient_id,'synthetic/not-a-document');
  EXCEPTION WHEN foreign_key_violation THEN rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Cross-patient result association was permitted'; END IF;

  INSERT INTO audit_events(actor_id,action,resource_type)
    VALUES(actor_id,'foundation.integrity_check','synthetic') RETURNING id INTO event_id;
  rejected := false;
  BEGIN
    UPDATE audit_events SET action='illegal_mutation' WHERE id=event_id;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'append-only event table cannot be modified' THEN RAISE; END IF;
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Audit UPDATE succeeded unexpectedly'; END IF;

  rejected := false;
  BEGIN
    DELETE FROM audit_events WHERE id=event_id;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'append-only event table cannot be modified' THEN RAISE; END IF;
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Audit DELETE succeeded unexpectedly'; END IF;

  INSERT INTO custody_events(specimen_id,actor_id,event_type,payload,occurred_at)
    VALUES(specimen_id,actor_id,'synthetic_handoff','{}',now())
    RETURNING id INTO custody_id;
  rejected := false;
  BEGIN
    DELETE FROM custody_events WHERE id=custody_id;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'append-only event table cannot be modified' THEN RAISE; END IF;
    rejected := true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Custody DELETE succeeded unexpectedly'; END IF;
END $phase1$;

ROLLBACK;
