-- Phase 2: patient-specific collection addresses require independent service-zone approval.
CREATE TABLE patient_addresses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 patient_id uuid NOT NULL REFERENCES patients(id),
 owner_user_id uuid NOT NULL REFERENCES users(id),
 zone_id uuid NOT NULL REFERENCES service_zones(id),
 label varchar(50) NOT NULL CHECK(length(trim(label)) BETWEEN 2 AND 50),
 address_line varchar(250) NOT NULL CHECK(length(trim(address_line)) BETWEEN 5 AND 250),
 locality varchar(100) NOT NULL CHECK(length(trim(locality)) BETWEEN 2 AND 100),
 verified_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX patient_addresses_owner_patient ON patient_addresses(owner_user_id,patient_id);
ALTER TABLE booking_drafts ADD COLUMN address_id uuid REFERENCES patient_addresses(id);
ALTER TABLE orders ADD COLUMN collection_address_id uuid REFERENCES patient_addresses(id);
ALTER TABLE orders ADD COLUMN collection_address_snapshot jsonb;
ALTER TABLE orders ADD CONSTRAINT order_address_snapshot_object CHECK (
 collection_address_snapshot IS NULL OR jsonb_typeof(collection_address_snapshot)='object'
);
