-- Synthetic-only lab accounting. An approved batch is NOT evidence of a bank payout.
CREATE TABLE phase4_lab_settlement_batches(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_key uuid NOT NULL UNIQUE,
 lab_id uuid NOT NULL REFERENCES laboratories(id),
 requested_by uuid NOT NULL REFERENCES users(id),
 total_kobo bigint NOT NULL CHECK(total_kobo > 0),
 status varchar(16) NOT NULL DEFAULT 'pending'
   CHECK(status IN ('pending','approved','rejected')),
 reviewed_by uuid REFERENCES users(id),
 reviewed_at timestamptz,
 review_note varchar(240),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT phase4_lab_batch_review CHECK(
   (status='pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND review_note IS NULL)
   OR (status IN ('approved','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
      AND char_length(btrim(review_note)) BETWEEN 10 AND 240)),
 CONSTRAINT phase4_lab_batch_distinct_review CHECK(requested_by<>reviewed_by)
);
CREATE TABLE phase4_lab_payables(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 result_id uuid NOT NULL UNIQUE REFERENCES results(id),
 lab_id uuid NOT NULL REFERENCES laboratories(id),
 amount_kobo bigint NOT NULL CHECK(amount_kobo > 0 AND amount_kobo <= 2147483647),
 agreement_reference varchar(80) NOT NULL
   CHECK(agreement_reference ~ '^SYN-[A-Z0-9-]{8,64}$'),
 entered_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 assigned_batch uuid REFERENCES phase4_lab_settlement_batches(id)
);
CREATE TABLE phase4_lab_settlement_items(
 batch_id uuid NOT NULL REFERENCES phase4_lab_settlement_batches(id),
 payable_id uuid NOT NULL REFERENCES phase4_lab_payables(id),
 amount_kobo bigint NOT NULL CHECK(amount_kobo>0),
 PRIMARY KEY(batch_id,payable_id)
);
CREATE INDEX phase4_lab_payables_available
 ON phase4_lab_payables(lab_id,created_at) WHERE assigned_batch IS NULL;
CREATE INDEX phase4_lab_batches_recent ON phase4_lab_settlement_batches(created_at DESC);
CREATE TRIGGER phase4_lab_batch_no_delete
 BEFORE DELETE ON phase4_lab_settlement_batches FOR EACH ROW
 EXECUTE FUNCTION reject_event_mutation();
CREATE TRIGGER phase4_lab_batch_items_immutable
 BEFORE UPDATE OR DELETE ON phase4_lab_settlement_items FOR EACH ROW
 EXECUTE FUNCTION reject_event_mutation();
