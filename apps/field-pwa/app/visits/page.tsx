import { Card, Notice, SiteShell, StatusPill } from '@fisher/ui';
import FieldTrainingWorkbench from './workbench';
export const dynamic = 'force-dynamic';

export default function FieldVisits() {
  const demo = process.env.NODE_ENV !== 'production' &&
    process.env.FISHER_PHASE3_DEMO_MODE === 'synthetic-only';
  return <SiteShell subtitle="Field · Visits" navigation={[{ href: '/', label: 'Overview' }]}>
    <section className="fisher-section"><div className="fisher-container">
      <p className="fisher-eyebrow">Phase 3 · Collection and custody</p>
      <h1 className="fisher-section-title">Field visit workbench</h1>
      <p className="fisher-lead">An assignment-scoped workflow for specimen collection, label checks, exceptions and courier handoffs.</p>
      <Notice title={demo ? 'Synthetic training only' : 'Assigned staff sign-in required'} tone="warning">
        {demo ? 'All steps are visual training interactions. No specimen, location or identity data is persisted or sent to the API.'
          : 'Authenticated field access has not been enabled. No assignments or patient details can be viewed here.'}
      </Notice>
      <div className="fisher-grid">
        <Card><StatusPill>Assignment</StatusPill><h3>Minimum necessary information</h3><p>Assigned staff can view specimen identities, not unrelated patient or result details.</p></Card>
        <Card><StatusPill>Offline resilience</StatusPill><h3>Explicit event reconciliation</h3><p>Pending event IDs and versions are reviewed and checked by the server before acceptance.</p></Card>
        <Card><StatusPill>Courier handoff</StatusPill><h3>Two-party custody</h3><p>The courier independently acknowledges the offered transfer with authenticated identity.</p></Card>
      </div>
      <FieldTrainingWorkbench demo={demo}/>
    </div></section>
  </SiteShell>;
