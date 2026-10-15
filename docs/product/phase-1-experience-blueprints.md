# Phase 1 — Service Experience and Platform Foundations

**Document type:** Fisher Healthcare product design baseline  
**Programme phase:** Product foundation, UX, and architecture

## Customer experience blueprint

| Customer interaction | Platform response | Operational dependency |
| --- | --- | --- |
| Explore diagnostic services | Presents supported categories, clinical preparation guidance, and service availability | Laboratory-approved test catalogue |
| Select collection service | Displays Regular/Premium options subject to address and actual scheduling capacity | Service coverage and staffing |
| Book for self or relative | Records the patient and the separately verified booking authority | Patient identity and consent/authority evidence |
| Complete booking and payment | Generates a confirmed order only after verified payment and scheduling checks | Payment provider and slot inventory |
| Receive specimen collection | Confirms assigned visit and records collection handoff | Qualified field workforce |
| Receive results | Makes validated, released results available to an authorized patient recipient | Laboratory release and secure delivery configuration |

The customer-facing site will not accept real bookings until Phase 2 functionality and applicable service launch gates have passed.

## Operations experience blueprint

The operations platform will consolidate order intake, dispatch queues, staffing, laboratory coordination, exceptions, audit oversight, and finance workflows. Access will be determined by the authenticated employee's current role and explicit service permissions. Clinical documents will not be visible solely because an employee has administrative privileges.

## Field experience blueprint

The field interface will prioritize assigned visits, patient verification, specimen labeling, collection records, and custody handoffs. It is intended to support intermittent connectivity, with conflict controls and acknowledgment tracking introduced during Phase 3. Phase 1 contains the design foundation and access boundaries only.

## Information architecture

| Interface | Primary navigation groups |
| --- | --- |
| Patient web | Home, How it works, Services, Booking (Phase 2), My account/results (later releases) |
| Operations web | Overview, Orders, Dispatch, Specimens, Laboratory Coordination, Exceptions, Finance, Administration |
| Field PWA | My assignments, Collection checklists, Handoffs, Incidents, Account |

Navigation items tied to unfinished functions must remain visibly unavailable rather than implying that live patient or operational capabilities exist.

## Accessibility and interaction standards

Fisher Healthcare targets WCAG 2.2 AA, mobile-first responsive layouts, keyboard operability, visible focus indicators, sufficient contrast, explicit form labels, accessible validation messages, reduced-motion accommodations, and non-color-only statuses.

Reusable components and design tokens are maintained in `packages/ui` and `packages/design-tokens`. Clinical accuracy, role-based information exposure, and user research remain review requirements before launch.
