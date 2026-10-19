-- Phase 3 custody manifest and incident resolution extension.
CREATE TABLE phase3_lab_manifests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 lab_id uuid NOT NULL REFERENCES laboratories(id),
 created_by uuid NOT NULL REFERENCES users(id),
 status varchar(24) NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','received','disputed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 received_at timestamptz,
 received_by uuid REFERENCES users(id)
);
CREATE TABLE phase3_manifest_specimens (
 manifest_id uuid NOT NULL REFERENCES phase3_lab_manifests(id),
 specimen_id uuid NOT NULL REFERENCES specimens(id),
 PRIMARY KEY(manifest_id,specimen_id),
 UNIQUE(specimen_id)
);
CREATE TABLE phase3_manifest_receipts (
 manifest_id uuid PRIMARY KEY REFERENCES phase3_lab_manifests(id),
 receipt_key uuid NOT NULL UNIQUE,
 received_by uuid NOT NULL REFERENCES users(id),
 accepted_specimen_ids jsonb NOT NULL,
 rejected_specimen_ids jsonb NOT NULL,
 rejection_reason_code varchar(32),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT manifest_receipt_rejection_reason CHECK (
    (jsonb_array_length(rejected_specimen_ids) = 0 AND rejection_reason_code IS NULL)
    OR
    (jsonb_array_length(rejected_specimen_ids) > 0 AND rejection_reason_code IN
      ('label_mismatch','leakage','temperature_excursion','damaged_container','quantity_mismatch','other'))
 )
);
ALTER TABLE phase3_incidents ADD COLUMN resolution_status varchar(24) NOT NULL DEFAULT 'open'
 CHECK (resolution_status IN ('open','resolved'));
ALTER TABLE phase3_incidents ADD COLUMN resolved_by uuid REFERENCES users(id);
ALTER TABLE phase3_incidents ADD COLUMN resolved_at timestamptz;
ALTER TABLE phase3_incidents ADD COLUMN resolution_note text;
