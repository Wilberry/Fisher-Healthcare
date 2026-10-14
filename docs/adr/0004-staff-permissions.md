# ADR 0004 — Explicit staff capabilities

Status: Accepted for foundation. Date: 2026-10-15.

Staff roles grant explicit capabilities. Administrator status does not automatically grant clinical result release or patient result viewing. Courier and collection staff have separate specimen permissions. Finance permissions do not imply clinical access. All protected endpoints must verify authenticated principal, current staff status, capability, and resource scope using trusted server-side data. The pure policy functions in `packages/auth` are only the policy core; they are not an authentication system and must not be wired to unverified client-supplied role claims.

Result reading is patient-specific and release-specific, with independently verified caregiver grants. Negative tests are mandatory before protected endpoints are enabled.
