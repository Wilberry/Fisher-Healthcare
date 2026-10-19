-- Phase 2 customer support, with no clinical message fields or automatic vendor delivery.
CREATE TABLE support_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id),
 booking_id uuid REFERENCES orders(id),
 category varchar(24) NOT NULL CHECK(category IN ('booking','payment','reschedule','account_access')),
 preferred_contact varchar(24) NOT NULL CHECK(preferred_contact IN ('email','whatsapp')),
 status varchar(24) NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','resolved')),
 idempotency_key varchar(128) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,idempotency_key)
);
CREATE TABLE support_work_items(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 case_id uuid NOT NULL UNIQUE REFERENCES support_cases(id),
 status varchar(24) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','assigned','resolved')),
 created_at timestamptz NOT NULL DEFAULT now()
);
