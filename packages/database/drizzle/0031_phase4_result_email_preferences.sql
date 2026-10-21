-- Result emails require independently revocable, patient-owned consent.
-- Booking consent and the can_book relationship are never sufficient.
CREATE TABLE phase4_result_email_preferences(
  user_id uuid NOT NULL REFERENCES users(id),
  patient_id uuid NOT NULL REFERENCES patients(id),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,patient_id)
);
CREATE INDEX phase4_result_email_enabled
 ON phase4_result_email_preferences(patient_id,user_id) WHERE enabled;
