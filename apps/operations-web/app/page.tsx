import Link from 'next/link';
import { Card, Notice, SiteShell, StatusPill } from '@fisher/ui';

const areas = [
  ['Order management', 'Bookings, confirmation status, customer support and lifecycle events'],
  ['Dispatch operations', 'Coverage, staff capacity, assignments and collection scheduling'],
  ['Specimen coordination', 'Collection records, identifiers, custody history and exceptions'],
  ['Laboratory operations', 'Partner offerings, handoffs, processing updates and result release'],
  ['Finance and oversight', 'Payment reconciliation, partner settlement and audit review'],
  ['Access governance', 'Staff authorization, permissions and security controls']
] as const;

export default function Operations() {
  return <SiteShell subtitle="Operations platform" navigation={[{ href: '#capabilities', label: 'Platform scope' }, { href: '#readiness', label: 'Readiness' }]}>
    <section className="fisher-section">
      <div className="fisher-container">
        <p className="fisher-eyebrow">Internal operating platform · Foundation preview</p>
        <h1 className="fisher-section-title">A coordinated view of healthcare operations.</h1>
        <p className="fisher-lead">Fisher Healthcare&apos;s internal platform is being designed to connect customer service, collection operations, laboratory coordination and financial administration.</p>
        <Notice title="Operational access is not active" tone="warning">
          This application is a design and engineering foundation. It does not connect to live bookings, patient records or laboratory results. Protected functions will be enabled only after server-side authorization and operational verification.
        </Notice>
      </div>
    </section>
    <section className="fisher-section" id="capabilities">
      <div className="fisher-container">
        <p className="fisher-eyebrow">Planned internal functions</p>
        <h2 className="fisher-section-title">Operational workstreams</h2>
        <div className="fisher-grid">{areas.map(([title,description]) => <Card key={title}>
          <StatusPill>Planned capability</StatusPill>
          <h3 style={{marginTop:18}}>{title}</h3><p>{description}</p>
        </Card>)}</div>
      </div>
    </section>
    <section className="fisher-section" id="readiness">
      <div className="fisher-container">
        <h2 className="fisher-section-title">Controlled activation</h2>
        <p className="fisher-lead">Staff access, role-specific workflows, accountability, and data handling controls remain mandatory before operational use. This environment does not display synthetic metrics as real operations.</p>
        <p><Link href="/dispatch">Dispatch workbench</Link> · <Link href="/results">Phase 4 result review</Link> · <Link href="/finance">Phase 4 finance</Link> (staff access required)</p>
      </div>
    </section>
  </SiteShell>;
}
