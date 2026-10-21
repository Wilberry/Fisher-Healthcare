-- Phase 3 additive schema; run only in isolated reviewed migration environment.
ALTER TYPE specimen_status ADD VALUE IF NOT EXISTS 'quarantined';
ALTER TABLE specimens ADD COLUMN IF NOT EXISTS custody_version integer NOT NULL DEFAULT 0;
ALTER TABLE specimens ADD CONSTRAINT specimens_custody_version_nonnegative CHECK (custody_version >= 0);
CREATE TABLE phase3_custody_receipts (
  event_id varchar(128) PRIMARY KEY,
  specimen_id uuid NOT NULL REFERENCES specimens(id),
  fingerprint char(64) NOT NULL,
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX phase3_custody_receipts_specimen_idx ON phase3_custody_receipts(specimen_id);
CREATE TABLE phase3_staff_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id),
  zone_code varchar(80) NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  CHECK (ends_at > starts_at)
);
CREATE TABLE phase3_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  staff_id uuid NOT NULL REFERENCES staff(id),
  shift_id uuid NOT NULL REFERENCES phase3_staff_shifts(id),
  status varchar(24) NOT NULL DEFAULT 'assigned',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('assigned','arrived','collecting','completed','failed','cancelled'))
);
CREATE UNIQUE INDEX phase3_one_live_assignment_per_order ON phase3_assignments(order_id)
 WHERE status IN ('assigned','arrived','collecting');
CREATE INDEX phase3_assignments_staff_idx ON phase3_assignments(staff_id,status);
CREATE TABLE phase3_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  specimen_id uuid REFERENCES specimens(id),
  assignment_id uuid REFERENCES phase3_assignments(id),
  reporter_id uuid NOT NULL REFERENCES users(id),
  kind varchar(64) NOT NULL,
  client_event_id uuid NOT NULL UNIQUE,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (specimen_id IS NOT NULL OR assignment_id IS NOT NULL)
);
