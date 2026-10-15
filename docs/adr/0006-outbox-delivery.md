# ADR 0006 — PostgreSQL outbox delivery and fencing

**Status:** Foundation implementation; staging acceptance outstanding.

Fisher Healthcare will use a PostgreSQL-backed transactional outbox as the initial durable async delivery mechanism. Domain transactions insert an outbox event atomically with their corresponding business records. Consumers claim records via `FOR UPDATE SKIP LOCKED`; each claim receives a new random lease token and a finite expiration. A worker can complete or fail a job only while its current token remains valid. Expired leases may be reclaimed without accepting late worker acknowledgments.

Handlers are allowlisted. The initial registered handler, `foundation.ping`, is a non-clinical test event. No payment or patient communication event will be enabled before its own idempotency and integration evidence is recorded. Exhausted attempts are dead-lettered for operational review; retries use bounded exponential backoff. Exception messages must be normalized to safe error codes and must not expose patient information.

The job system is not proof of delivery exactly once: external handlers need their own idempotency keys, deduplication checks, and audit evidence. Staging acceptance requires concurrent claim tests, stale-lease recovery, dead-letter verification, and replay safety.
