# ADR 0001 — Modular monolith

Status: Accepted. Date: 2026-10-15.

Decision: TypeScript modular monolith with NestJS API, Next.js clients, PostgreSQL transactional store and dedicated durable worker. Domain modules own invariants and data access. External integrations use adapters and transactional outbox. Avoid client-side bypass of authorization. Motivation: consistent specimen, result and finance transactions with manageable deployment and testability.
