-- Phase 3 laboratory receiving authority. Internal onboarding reviews these scopes.
-- Only a currently active lab coordinator with a specific laboratory grant may receive.
CREATE TABLE phase3_lab_staff_access (
  lab_id uuid NOT NULL REFERENCES laboratories(id),
  staff_id uuid NOT NULL REFERENCES staff(id),
  active boolean NOT NULL DEFAULT false,
  granted_by uuid NOT NULL REFERENCES users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY(lab_id,staff_id),
  CONSTRAINT phase3_lab_access_revocation_consistency
    CHECK ((active AND revoked_at IS NULL) OR NOT active)
);
CREATE INDEX phase3_lab_staff_active_scope ON phase3_lab_staff_access(staff_id,lab_id)
 WHERE active AND revoked_at IS NULL;
