-- Phase 2: extend the Phase 1 payment state constraint to accommodate safe initiation
-- and independently verified settlement, without removing legacy allowed states.
ALTER TABLE payments DROP CONSTRAINT payment_status_allowed;
ALTER TABLE payments ADD CONSTRAINT payment_status_allowed
 CHECK(status IN ('initiating','pending','paid','verified','failed','refunded','partially_refunded'));
