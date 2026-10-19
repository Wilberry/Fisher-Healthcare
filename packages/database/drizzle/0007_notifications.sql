-- Phase 2 durable notification intents and unresolved paid-order exceptions.
-- No delivery state is fabricated; provider integration must explicitly transition pending->sent.
CREATE TABLE notification_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES orders(id),
 channel varchar(20) NOT NULL CHECK(channel IN ('email','whatsapp')),
 template varchar(60) NOT NULL,
 status varchar(20) NOT NULL DEFAULT 'pending'
   CHECK(status IN ('pending','sending','sent','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 provider_receipt text,
 UNIQUE(order_id,channel,template),
 CONSTRAINT notification_sent_consistent CHECK(
  (status='sent' AND sent_at IS NOT NULL AND provider_receipt IS NOT NULL)
   OR (status<>'sent' AND sent_at IS NULL))
);
CREATE TABLE payment_review_alerts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES orders(id),
 payment_id uuid NOT NULL UNIQUE REFERENCES payments(id),
 reason varchar(100) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz
);
