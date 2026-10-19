-- Phase 2. Additive only; Phase 1 constraints remain authoritative.
CREATE TABLE service_zones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code varchar(64) NOT NULL UNIQUE,
 name varchar(160) NOT NULL,
 active boolean NOT NULL DEFAULT false,
 regular_fee_kobo integer NOT NULL CHECK (regular_fee_kobo >= 0),
 premium_fee_kobo integer NOT NULL CHECK (premium_fee_kobo >= 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE collection_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 zone_id uuid NOT NULL REFERENCES service_zones(id),
 lab_id uuid NOT NULL REFERENCES laboratories(id),
 tier varchar(20) NOT NULL CHECK (tier IN ('regular','premium')),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 cutoff_at timestamptz NOT NULL,
 capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 10000),
 active boolean NOT NULL DEFAULT false,
 CONSTRAINT collection_slot_window CHECK (starts_at < ends_at AND cutoff_at <= starts_at),
 UNIQUE (id, zone_id, lab_id, tier)
);
CREATE INDEX collection_slots_lookup ON collection_slots(zone_id, lab_id, tier, starts_at)
 WHERE active;
CREATE TABLE booking_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 zone_id uuid NOT NULL REFERENCES service_zones(id),
 slot_id uuid NOT NULL REFERENCES collection_slots(id),
 lab_id uuid NOT NULL REFERENCES laboratories(id),
 tier varchar(20) NOT NULL CHECK (tier IN ('regular','premium')),
 currency varchar(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
 items jsonb NOT NULL,
 tests_total_kobo integer NOT NULL CHECK (tests_total_kobo >= 0),
 logistics_fee_kobo integer NOT NULL CHECK (logistics_fee_kobo >= 0),
 total_kobo integer NOT NULL CHECK (total_kobo >= 0),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT quote_total_matches CHECK (total_kobo = tests_total_kobo + logistics_fee_kobo),
 CONSTRAINT quote_items_are_array CHECK (jsonb_typeof(items) = 'array'),
 CONSTRAINT quote_slot_match FOREIGN KEY (slot_id,zone_id,lab_id,tier)
   REFERENCES collection_slots(id,zone_id,lab_id,tier)
);
CREATE TABLE booking_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id),
 patient_id uuid NOT NULL REFERENCES patients(id),
 quote_id uuid NOT NULL REFERENCES booking_quotes(id),
 status varchar(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open','committed','cancelled')),
 order_id uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE slot_holds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 draft_id uuid NOT NULL UNIQUE REFERENCES booking_drafts(id),
 slot_id uuid NOT NULL REFERENCES collection_slots(id),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX slot_holds_live ON slot_holds(slot_id,expires_at);
ALTER TABLE orders
 ADD COLUMN slot_id uuid REFERENCES collection_slots(id),
 ADD COLUMN quote_id uuid UNIQUE REFERENCES booking_quotes(id),
 ADD COLUMN booking_draft_id uuid UNIQUE REFERENCES booking_drafts(id),
 ADD COLUMN payment_expires_at timestamptz;
ALTER TABLE booking_drafts
 ADD CONSTRAINT booking_draft_order_fk FOREIGN KEY (order_id) REFERENCES orders(id);
CREATE INDEX orders_slot_active ON orders(slot_id,status,payment_expires_at);
CREATE UNIQUE INDEX payments_phase2_one_per_order ON payments(order_id);
CREATE TABLE payment_webhook_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_hash char(64) NOT NULL UNIQUE,
 provider_reference varchar(200),
 received_at timestamptz NOT NULL DEFAULT now()
);
-- Keep this migration under the existing SHA256 migration registry.
