-- Record explicit synthetic booking-policy acknowledgment without granting clinical permissions.
ALTER TABLE booking_drafts
 ADD COLUMN consent_version varchar(60),
 ADD COLUMN consented_at timestamptz;
ALTER TABLE booking_drafts ADD CONSTRAINT booking_draft_consent_consistent
 CHECK ((consent_version IS NULL) = (consented_at IS NULL));
ALTER TABLE orders ADD COLUMN booking_consent_version varchar(60);
ALTER TABLE guest_booking_requests
 ADD COLUMN consent_version varchar(60),
 ADD COLUMN consented_at timestamptz;
ALTER TABLE guest_booking_requests ADD CONSTRAINT guest_consent_consistent CHECK (
 (consent_version IS NULL) = (consented_at IS NULL)
);
