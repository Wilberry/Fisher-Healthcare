import { Card, Notice, SiteShell, StatusPill } from '@fisher/ui';
import FieldTrainingWorkbench from './workbench';
import {OfflineRecoveryPanel} from '../../components/offline-recovery-panel';
import Link from 'next/link';
import {staffApi,oidcConfig} from '../../lib/staff-auth';
export const dynamic = 'force-dynamic';

export default async function FieldVisits() {
  const assignments=await staffApi('field/assignments');
  const demo = !assignments.authorized && process.env.NODE_ENV !== 'production' &&
    process.env.FISHER_PHASE3_DEMO_MODE === 'synthetic-only';
  const sessionEnabled=Boolean(oidcConfig());
  const offlineEnabled=process.env.NODE_ENV!=='production' &&
    process.env.FISHER_PHASE3_OFFLINE_DEMO_MODE==='synthetic-only';
  return <SiteShell subtitle="Field · Visits" navigation={[{ href: '/', label: 'Overview' }]}>
    <section className="fisher-section"><div className="fisher-container">
      <p className="fisher-eyebrow">Phase 3 · Collection and custody</p>
      <h1 className="fisher-section-title">Field visit workbench</h1>
      <p className="fisher-lead">An assignment-scoped workflow for specimen collection, label checks, exceptions and courier handoffs.</p>
      <p><Link href="/handoffs">Courier handoffs requiring my acknowledgment</Link></p>
      <Notice title={assignments.authorized ? 'Authorized synthetic field assignments' :
        demo ? 'Synthetic training only' : 'Assigned staff sign-in required'} tone="warning">
        {assignments.authorized&&offlineEnabled&&<OfflineRecoveryPanel/>}
      {assignments.authorized ? 'Assigned work is verified by the API at request time, and operations remain synthetic-only.'
          : demo ? 'All steps are visual training interactions. No specimen, location or identity data is persisted or sent to the API.'
          : 'Assignments and patient data are not available without an authenticated staff session and current field permissions.'}
      </Notice>
      {sessionEnabled && (assignments.signedIn ?
        <form method="post" action="/auth/logout">
          <button className="fisher-button fisher-button--secondary" type="submit">Sign out</button>
        </form> :
        <p><Link href="/auth/login?next=%2Fvisits" className="fisher-button fisher-button--primary">
          Field staff sign in
        </Link></p>)}
      <div className="fisher-grid">
        <Card><StatusPill>Assignment</StatusPill><h3>Minimum necessary information</h3><p>Assigned staff can view specimen identities, not unrelated patient or result details.</p></Card>
        <Card><StatusPill>Offline resilience</StatusPill><h3>Explicit event reconciliation</h3><p>Pending event IDs and versions are reviewed and checked by the server before acceptance.</p></Card>
        <Card><StatusPill>Courier handoff</StatusPill><h3>Two-party custody</h3><p>The courier independently acknowledges the offered transfer with authenticated identity.</p></Card>
      </div>
      {assignments.authorized ?
        <section className="fisher-section" aria-label="Your assigned visits">
          <h2 className="fisher-section-title">Your assigned visits</h2>
          {assignments.records.length ? <ul>
            {assignments.records.map((item,index)=>{
              const id=typeof item.id==='string'?item.id:'';
              const status=typeof item.status==='string'?item.status:'';
              const windowStart=typeof item.collection_window_start==='string'?item.collection_window_start:'';
              return <li key={id||index}>
                <strong>{id?<Link href={'/visits/'+id}>Assignment {id.slice(0,8)}</Link>:
                  'Assignment unavailable'}</strong> · {status} · {windowStart}
              </li>;
            })}
          </ul> : <p role="status">No assigned visits are available for this account.</p>}
          <p>Collection actions remain subject to server-side barcode, assignment and custody authorization.</p>
        </section> : <FieldTrainingWorkbench demo={demo}/>}
    </div></section>
  </SiteShell>;
