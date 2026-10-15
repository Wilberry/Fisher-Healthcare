# ADR 0005 — Verified OIDC identity boundary

**Status:** Foundation implemented; provider and integration acceptance pending.

The Fisher API verifies bearer JWT signatures using a remote JWKS, an explicit issuer, an explicit audience, and an allowlist of asymmetric signature algorithms. No API authentication route accepts a caller-supplied staff role or patient ID as proof of authorization. A missing provider configuration fails closed.

The `GET /api/v1/identity/session` endpoint is an authentication diagnostic only. It returns the verified identity subject and is not a patient data endpoint. Protected business routes must additionally load the current staff status, patient relationships, and resource scope from trusted database records. The presence of a valid JWT does not establish any such permission.

The provider's discovery metadata, key rotation, access token semantics, session revocation, administrative MFA, account provisioning, and negative integration tests require completion before patient information is exposed.
