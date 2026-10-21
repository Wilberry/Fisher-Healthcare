-- Phase 3: receipt and frozen membership tables are immutable after insertion.
-- Phase 1 already protects custody_events and audit_events with reject_event_mutation().
CREATE TRIGGER phase3_custody_receipts_immutable
 BEFORE UPDATE OR DELETE ON phase3_custody_receipts
 FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();
CREATE TRIGGER phase3_manifest_receipts_immutable
 BEFORE UPDATE OR DELETE ON phase3_manifest_receipts
 FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();
CREATE TRIGGER phase3_handoff_specimens_immutable
 BEFORE UPDATE OR DELETE ON phase3_handoff_specimens
 FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();
CREATE TRIGGER phase3_manifest_specimens_immutable
 BEFORE UPDATE OR DELETE ON phase3_manifest_specimens
 FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();
