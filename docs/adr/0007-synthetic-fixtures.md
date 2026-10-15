# ADR 0007 — Synthetic development fixtures

**Status:** Adopted for Phase 1 engineering environments.

Development and automated tests will use synthetic identities and inactive catalogue and laboratory records only. Real personal, medical, payment, and operational records are prohibited in software development fixtures.

The synthetic fixture script targets only named disposable PostgreSQL databases (`fisher_dev` or `fisher_test`) and requires an explicit acknowledgment. Sample laboratory and catalogue records are disabled by default, have visibly synthetic names, and cannot be mistaken for approved clinical offerings.

Integration tests may create synthetic patient relationships and results exclusively to prove authorization and audit behavior. Immutable audit records are intentionally retained inside disposable test databases, which are destroyed as a whole after isolated testing under controlled procedures.
