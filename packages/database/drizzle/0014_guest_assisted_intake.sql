-- Synthetic guest-assisted booking intake: contact verification is not booking authorization.
CREATE TABLE guest_booking_requests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email varchar(320) NOT NULL,
 quote_id uuid NOT NULL REFERENCES booking_quotes(id),
 code_hash char(64) NOT NULL,
 expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 verified_at timestamptz,
 status varchar(24) NOT NULL DEFAULT 'awaiting_email'
  CHECK(status IN ('awaiting_email','pending_review','in_review','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT guest_verification_consistent CHECK(status='awaiting_email' OR verified_at IS NOT NULL)
);
CREATE INDEX guest_booking_throttle ON guest_booking_requests(email,created_at);
CREATE TABLE guest_booking_work_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE REFERENCES guest_booking_requests(id),
 status varchar(24) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','assigned','resolved')),
 created_at timestamptz NOT NULL DEFAULT now()
);
