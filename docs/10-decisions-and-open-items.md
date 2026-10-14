# Decisions and open items

## Approved product decisions

| ID | Decision |
| --- | --- |
| DEC-001 | Greenfield Fisher Healthcare product; previous Figma concept is reference only, not the implementation design |
| DEC-002 | Figma placeholder logo is not the official logo; use approved branding assets when provided |
| DEC-003 | Customers can book for themselves and authorized family members |
| DEC-004 | Laboratories are coordinated internally at launch; self-service portal follows later |
| DEC-005 | Full-platform architecture with phased implementation |
| DEC-006 | Results available securely on patient dashboard alongside approved email delivery |
| DEC-007 | Lagos-first website and WhatsApp-assisted ordering |
| DEC-008 | Regular and Premium collection tiers; actual availability and lab-specific turnaround must be verified |
| DEC-009 | Combined customer checkout; separate logistics revenue and laboratory settlement accounting |
| DEC-010 | TypeScript-first modular monolith with Next.js, NestJS, PostgreSQL, Drizzle, pnpm/Turborepo, field PWA, durable jobs and private object storage |
| DEC-011 | Documentation is authoritative before coding and must remain synchronized with implementation |

## Decisions awaiting confirmation

| ID | Owner to confirm | Item |
| --- | --- | --- |
| OPEN-001 | Business/operations | Lagos launch zones, collection days and cutoffs |
| OPEN-002 | Laboratory partnerships | Contracted labs, test menus, specimen requirements and turnaround |
| OPEN-003 | Finance/business | Prices, lab settlement terms, cancellation/refund policy |
| OPEN-004 | Clinical lead | Collection, packaging, temperature control and handoff SOPs |
| OPEN-005 | Clinical/legal | Result release, urgent findings, minors and adult caregiver authorization |
| OPEN-006 | Security/legal | Data protection impact assessment, retention and vendor agreements |
| OPEN-007 | Infrastructure | Hosting region, identity provider, storage/email vendors, recovery targets |
| OPEN-008 | Operations | Field staff model, shifts, transport responsibility and incident escalation |
| OPEN-009 | Brand/product | Final logo assets and visual brand guidelines |

## Decision process

Each open item receives an owner, evidence, proposed options, selected decision, approval date and affected requirements/ADRs before it becomes a binding implementation assumption. Never invent operational pricing or medical promises.
