import { Card, Notice, SiteShell, StatusPill } from '@fisher/ui';
import DispatchWorkbench from './workbench';
import Link from 'next/link';
import {staffApi,oidcConfig} from '../../lib/staff-auth';
export const dynamic = 'force-dynamic';

export default async function DispatchConsole() {
  // Never read a browser token: the encrypted HTTP-only session and current
  // staff capability are verified through the API on every server render.
  const queue=await staffApi('ops/assignments/queue');
  const sessionEnabled=Boolean(oidcConfig());
  // Never expose any staff or order data without signed staff SSO.
  // Visual-only fixtures require an explicit NON-production local flag.
  const demo = !queue.authorized && process.env.NODE_ENV !== 'production' &&
    process.env.FISHER_PHASE3_DEMO_MODE === 'synthetic-only';
  return <SiteShell subtitle="Operations · Dispatch" navigation={[{ href: '/', label: 'Overview' }]}>
    <section className="fisher-section"><div className="fisher-container">
      <p className="fisher-eyebrow">Phase 3 · Dispatch operations</p>
      <h1 className="fisher-section-title">Collection dispatch workbench</h1>
      <p className="fisher-lead">Plan assignments by zone, shift and capacity, then monitor exception-sensitive handoffs.</p>
      <p><Link href="/exceptions">Review open custody incidents</Link> · <Link href="/lab-manifests">Laboratory handoffs</Link> · <Link href="/lab-access">Laboratory staff administration</Link></p>
      <Notice title={queue.authorized ? 'Authorized synthetic dispatch queue' :
        demo ? 'Synthetic training mode only' : 'Staff identity verification required'} tone="warning">
        {queue.authorized ? 'Only server-authorized work items are shown. Phase 3 remains in restricted synthetic mode.'
          : demo ? 'These entries are invented for interface review. Changes do not reach the API or any specimen record.'
          : 'Dispatch records remain hidden until staff sign-in and scoped server-side verification succeed.'}
      </Notice>
      {sessionEnabled && (queue.signedIn ?
        <form method="post" action="/auth/logout">
          <button className="fisher-button fisher-button--secondary" type="submit">Sign out</button>
        </form> :
        <p><Link href="/auth/login?next=%2Fdispatch" className="fisher-button fisher-button--primary">
          Staff sign in
        </Link></p>)}
      <div className="fisher-grid">
        <Card><StatusPill>Dispatch</StatusPill><h3>Assignment readiness</h3><p>Confirmed orders, zone eligibility and overlapping shift safeguards.</p></Card>
        <Card><StatusPill>Custody</StatusPill><h3>Receiving-party acknowledgment</h3><p>Every specimen transfer requires an authenticated recipient.</p></Card>
        <Card><StatusPill>Exceptions</StatusPill><h3>Incident review</h3><p>Open specimen incidents prevent onward handoff and laboratory receipt.</p></Card>
      </div>
      {queue.authorized ?
        <section className="fisher-section" aria-label="Authorized collection queue">
          <h2 className="fisher-section-title">Authorized collection queue</h2>
          <p role="status">Server-verified dispatch items. No patient contact details or clinical results.</p>
          {queue.records.length ?
            <div style={{overflowX:'auto'}}><table style={{width:'100%'}}>
              <thead><tr><th scope="col">Order reference</th><th scope="col">Zone</th>
                <th scope="col">Tier</th><th scope="col">Collection window</th></tr></thead>
              <tbody>{queue.records.map((item,index)=>{
                const id=typeof item.id==='string'?item.id:'';
                const zone=typeof item.zone_code==='string'?item.zone_code:'';
                const tier=typeof item.tier==='string'?item.tier:'';
                const when=typeof item.collection_window_start==='string'?item.collection_window_start:'';
                return <tr key={id||index}><td>{id?<Link href={'/dispatch/'+id}>View {id.slice(0,8)}</Link>:'—'}</td>
                  <td>{zone}</td><td>{tier}</td><td>{when}</td></tr>;
              })}</tbody>
            </table></div> : <p>No eligible paid collection orders are queued for dispatch.</p>}
        </section> : <DispatchWorkbench demo={demo}/>}
    </div></section>
  </SiteShell>;
