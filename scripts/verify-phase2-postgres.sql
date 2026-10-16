-- Phase 2 synthetic integration; no rows survive this transaction.
BEGIN;
DO $phase2$
DECLARE
 names text[]:=ARRAY[
  'users','patients','patient_relationships','orders','order_items','results','audit_events',
  'service_zones','collection_slots','booking_quotes','booking_drafts','slot_holds',
  'payment_webhook_events','booking_schedule_changes','notification_intents',
  'payment_review_alerts','patient_addresses','support_cases','support_work_items'
 ];
 name text;
 bad boolean;
BEGIN
 IF current_database()<>'fisher_test' THEN
  RAISE EXCEPTION 'Refusing Phase 2 SQL checks outside fisher_test';
 END IF;
 IF (SELECT COUNT(*) FROM fisher_migrations)<>12 THEN
  RAISE EXCEPTION 'Expected 12 checksummed migrations 0000 through 0011';
 END IF;
 FOREACH name IN ARRAY names LOOP
  IF to_regclass('public.'||name) IS NULL THEN
   RAISE EXCEPTION 'Required table missing: %',name;
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='results_order_patient_match') THEN
  RAISE EXCEPTION 'Phase 1 ownership guard missing';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger
   WHERE tgname='audit_events_immutable' AND NOT tgisinternal) THEN
  RAISE EXCEPTION 'Append-only audit guard missing';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_index x JOIN pg_class c ON c.oid=x.indexrelid
   WHERE c.relname='payments_phase2_one_per_order' AND x.indisunique) THEN
  RAISE EXCEPTION 'Single payment per booking index missing';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_index x JOIN pg_class c ON c.oid=x.indexrelid
   WHERE c.relname='booking_draft_actor_commit_key' AND x.indisunique) THEN
  RAISE EXCEPTION 'Booking idempotency index missing';
 END IF;
 bad:=false;
 BEGIN
  INSERT INTO service_zones(code,name,regular_fee_kobo,premium_fee_kobo)
   VALUES('synthetic-bad-fee','Synthetic bad fee',-1,0);
 EXCEPTION WHEN check_violation THEN bad:=true;
 END;
 IF NOT bad THEN RAISE EXCEPTION 'Negative zone fee was allowed'; END IF;
 bad:=false;
 BEGIN
  INSERT INTO support_cases(user_id,category,preferred_contact,idempotency_key)
   VALUES(gen_random_uuid(),'medical_results','email','synthetic-invalid-case');
 EXCEPTION WHEN check_violation THEN bad:=true;
 END;
 IF NOT bad THEN RAISE EXCEPTION 'Unsupported sensitive support category allowed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='payment_status_allowed' AND
    pg_get_constraintdef(oid) LIKE '%initiating%' AND pg_get_constraintdef(oid) LIKE '%paid%') THEN
  RAISE EXCEPTION 'Phase 2 payment state constraint not installed';
 END IF;
END $phase2$;
ROLLBACK;
