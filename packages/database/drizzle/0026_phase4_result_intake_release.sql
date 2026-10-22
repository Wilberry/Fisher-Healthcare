-- Phase 4: result intake and release controls. Additive; no existing result becomes released.
-- A record is linked to exactly one ordered test and an accepted laboratory specimen.
-- Document keys remain private, and email intents carry no diagnostic content.
CREATE TABLE phase4_result_intakes (
  result_id uuid PRIMARY KEY REFERENCES results(id),
  order_item_id uuid NOT NULL UNIQUE REFERENCES order_items(id),
  specimen_id uuid NOT NULL REFERENCES specimens(id),
  lab_id uuid NOT NULL REFERENCES laboratories(id),
  intake_key uuid NOT NULL UNIQUE,
  intake_fingerprint char(64) NOT NULL,
  document_sha256 char(64) NOT NULL,
  validation_reference varchar(80) NOT NULL,
  intake_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (validation_reference ~ '^SYN-[A-Z0-9-]{8,64}$')
);
CREATE INDEX phase4_result_intakes_specimen_idx ON phase4_result_intakes(specimen_id);
CREATE TRIGGER phase4_result_intakes_immutable
  BEFORE UPDATE OR DELETE ON phase4_result_intakes
  FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();

CREATE TABLE phase4_result_release_events (
  result_id uuid PRIMARY KEY REFERENCES results(id),
  release_key uuid NOT NULL UNIQUE,
  released_by uuid NOT NULL REFERENCES users(id),
  released_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER phase4_result_release_events_immutable
  BEFORE UPDATE OR DELETE ON phase4_result_release_events
  FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();

CREATE TABLE phase4_result_delivery_intents (
  result_id uuid NOT NULL REFERENCES results(id),
  channel varchar(16) NOT NULL CHECK (channel='email'),
  status varchar(24) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(result_id,channel)
);
-- No outbound email service is activated by this migration.
