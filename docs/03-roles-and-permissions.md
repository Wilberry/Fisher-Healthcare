# Roles, identity and authorization

**Rule:** Deny by default. A role grants capabilities, while resource-level policy decides whether a particular patient, booking, specimen or result may be accessed.

## 1. Roles

| Role | Allowed scope |
| --- | --- |
| Guest | Public catalogue, availability, draft quotes, verified limited booking access |
| Patient | Own profile, bookings, invoices and released results |
| Caregiver | Authorized dependent/relative booking and permitted information only |
| Phlebotomist | Assigned visits, minimum necessary collection details and custody events |
| Courier | Assigned specimen transport and custody information, not diagnostic results |
| Support agent | Booking support and nonclinical metadata within case scope |
| Dispatcher | Scheduling, assignment, service zones, exception handling |
| Lab coordinator | Partner configuration, manifests, lab handoff, controlled result workflow |
| Finance officer | Payment, refund, settlement and financial reports; no clinical result contents |
| Clinical/result-release authorized staff | Controlled result verification/release under approved workflow |
| Administrator | Staff, configuration, permissions and audits; not automatic unrestricted clinical access |
| Auditor | Time-limited, purpose-bound read access to approved audit records |

## 2. Authorization matrix

| Resource/action | Patient | Caregiver | Field | Ops | Finance |
| --- | --- | --- | --- | --- | --- |
| View own booking | Own | Authorized patient | Assigned summary | Role-scoped | Payment metadata |
| Create booking | Own | Authorized | No | Assisted intake | No |
| View result document | Own, released | Explicit grant only | No | Result-authorized staff only | No |
| Change collection status | No | No | Assigned action | Authorized correction | No |
| Custody handoff | No | No | Assigned custody actor | Authorized lab/dispatch actor | No |
| Issue refund | Request | Request | No | Support initiates | Finance approves/executes |
| Manage test catalogue | No | No | No | Authorized coordinator | No |
| Manage permissions | No | No | No | Admin only | No |

All decisions require server-side checks; UI visibility is not an authorization boundary.

## 3. Family relationships and consent

Store patient identity independently of user identity. Represent caregiver-to-patient relationships with type, verified authority, scope, status, effective dates and revocation. Adult patients grant explicit permission to view results; booking on their behalf alone does not grant it. For minors and other represented patients, use legally reviewed guardianship rules. Revoke grants promptly and log access.

## 4. Authentication and sessions

OIDC-compatible identity; verified email/phone as needed; MFA for privileged users; session revocation; account recovery; rate limits; protected service-to-service credentials; no credentials in source control. Guest order access requires a short-lived verified mechanism and must not reveal sensitive results without proper authorization.

## 5. Auditing

Record actor, subject/resource, purpose/context, action, outcome, timestamp and request correlation. Audit patient record/result reads, consent changes, staff role changes, refunds, specimen custody and document releases. Restrict audit log access and retention.
