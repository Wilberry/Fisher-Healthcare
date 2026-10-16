-- Append-only schedule changes for unpaid orders; payment initiation blocks self-service changes.
CREATE TABLE booking_schedule_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES orders(id),
 from_slot_id uuid NOT NULL REFERENCES collection_slots(id),
 to_slot_id uuid NOT NULL REFERENCES collection_slots(id),
 idempotency_key varchar(128) NOT NULL,
 actor_id uuid NOT NULL REFERENCES users(id),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,idempotency_key)
);
