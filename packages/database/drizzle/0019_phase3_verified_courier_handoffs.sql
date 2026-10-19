-- Phase 3: collector-offered / authenticated-courier-acknowledged specimen handoff.
-- New migration: do not alter the migration registry or earlier committed migrations.
CREATE TABLE phase3_handoff_offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assignment_id uuid NOT NULL REFERENCES phase3_assignments(id),
 sender_staff_id uuid NOT NULL REFERENCES staff(id),
 courier_staff_id uuid NOT NULL REFERENCES staff(id),
 status varchar(16) NOT NULL DEFAULT 'offered'
    CHECK (status IN ('offered','received','cancelled')),
 receipt_key uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 received_at timestamptz,
 CHECK (sender_staff_id <> courier_staff_id),
 CHECK ((status = 'received' AND receipt_key IS NOT NULL AND received_at IS NOT NULL)
     OR (status <> 'received' AND receipt_key IS NULL AND received_at IS NULL))
);
CREATE UNIQUE INDEX phase3_one_pending_or_received_handoff_per_assignment
  ON phase3_handoff_offers(assignment_id)
  WHERE status IN ('offered','received');
CREATE TABLE phase3_handoff_specimens (
 offer_id uuid NOT NULL REFERENCES phase3_handoff_offers(id),
 specimen_id uuid NOT NULL REFERENCES specimens(id),
 expected_version integer NOT NULL CHECK(expected_version >= 0),
 PRIMARY KEY(offer_id,specimen_id)
);
CREATE INDEX phase3_handoff_courier_queue
  ON phase3_handoff_offers(courier_staff_id,status,created_at);
