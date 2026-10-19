-- Retain the original Paystack test-mode checkout session for safe retry recovery.
ALTER TABLE payments
 ADD COLUMN client_key varchar(128),
 ADD COLUMN checkout_url text;
ALTER TABLE payments
 ADD CONSTRAINT payments_checkout_url_limited CHECK(checkout_url IS NULL OR length(checkout_url)<=2048);
CREATE UNIQUE INDEX payment_order_client_key ON payments(order_id,client_key) WHERE client_key IS NOT NULL;
