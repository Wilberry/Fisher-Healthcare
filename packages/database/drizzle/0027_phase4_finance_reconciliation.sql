-- Phase 4: immutable, synthetic-only reconciliation evidence.
-- No money moves and no provider is contacted by this migration.
CREATE TABLE phase4_finance_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key uuid NOT NULL UNIQUE,
  run_by uuid NOT NULL REFERENCES users(id),
  checked_count integer NOT NULL CHECK (checked_count >= 0),
  exception_count integer NOT NULL CHECK (exception_count >= 0 AND exception_count <= checked_count),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE phase4_finance_reconciliation_items (
  run_id uuid NOT NULL REFERENCES phase4_finance_reconciliation_runs(id),
  payment_id uuid NOT NULL REFERENCES payments(id),
  reason varchar(40) NOT NULL
    CHECK(reason IN ('paid_ledger_mismatch','unexpected_ledger','refund_not_reconciled')),
  PRIMARY KEY(run_id,payment_id)
);
CREATE INDEX phase4_finance_reconciliation_recent ON phase4_finance_reconciliation_runs(created_at DESC);
CREATE TRIGGER phase4_reconciliation_runs_immutable
  BEFORE UPDATE OR DELETE ON phase4_finance_reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();
CREATE TRIGGER phase4_reconciliation_items_immutable
  BEFORE UPDATE OR DELETE ON phase4_finance_reconciliation_items
  FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();
