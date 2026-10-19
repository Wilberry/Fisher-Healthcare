import { Card, Notice, SiteShell, StatusPill } from '@fisher/ui';
import DispatchWorkbench from './workbench';
export const dynamic = 'force-dynamic';

export default function DispatchConsole() {
  // Never expose any staff or order data without signed staff SSO.
  // Visual-only fixtures require an explicit NON-production local flag.
  const demo = process.env.NODE_ENV !== 'production' &&
    process.env.FISHER_PHASE3_DEMO_MODE === 'synthetic-only';
  return <SiteShell subtitle="Operations · Dispatch" navigation={[{ href: '/', label: 'Overview' }]}>
    <section className="fisher-section"><div className="fisher-container">
      <p className="fisher-eyebrow">Phase 3 · Dispatch operations</p>
      <h1 className="fisher-section-title">Collection dispatch workbench</h1>
      <p className="fisher-lead">Plan assignments by zone, shift and capacity, then monitor exception-sensitive handoffs.</p>
      <Notice title={demo ? 'Synthetic training mode only' : 'Staff identity verification required'} tone="warning">
        {demo ? 'These entries are invented for interface review. Changes do not reach the API or any specimen record.'
          : 'Live assignment data and operational controls stay unavailable until staff SSO and server-side permissions are verified.'}
      </Notice>
      <div className="fisher-grid">
        <Card><StatusPill>Dispatch</StatusPill><h3>Assignment readiness</h3><p>Confirmed orders, zone eligibility and overlapping shift safeguards.</p></Card>
        <Card><StatusPill>Custody</StatusPill><h3>Receiving-party acknowledgment</h3><p>Every specimen transfer requires an authenticated recipient.</p></Card>
        <Card><StatusPill>Exceptions</StatusPill><h3>Incident review</h3><p>Open specimen incidents prevent onward handoff and laboratory receipt.</p></Card>
      </div>
      <DispatchWorkbench demo={demo}/>
    </div></section>
  </SiteShell>;
