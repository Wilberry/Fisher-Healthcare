import Link from 'next/link';
import {SiteShell,Notice} from '@fisher/ui';
import {staffApi,oidcConfig} from '../../lib/staff-auth';
import {CourierAcknowledge} from './courier-acknowledge';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function CourierHandoffs(){
  const queue=await staffApi('field/handoff-offers');
  return <SiteShell subtitle="Field · Courier handoffs"
    navigation={[{href:'/visits',label:'Visits'}]}>
    <section className="fisher-section"><div className="fisher-container">
      <p className="fisher-eyebrow">Phase 3 · Two-party specimen custody</p>
      <h1 className="fisher-section-title">My pending courier handoffs</h1>
      {!queue.authorized?
        <Notice title="Assigned courier authentication required" tone="warning">
          Only authenticated couriers may acknowledge handoffs addressed to them.
          {oidcConfig()&&<p><Link href="/auth/login?next=%2Fhandoffs">Staff sign in</Link></p>}
        </Notice>:
        <>
          <p>Review each transfer physically before acknowledging. Receipt advances
            specimen custody only when the assigned courier signs this action.</p>
          {!queue.records.length?<p role="status">No pending courier handoffs.</p>:
            <ul>{queue.records.filter(item=>typeof item.id==='string'&&uuid.test(item.id)).map(item=>{
              const id=item.id as string;
              const count=typeof item.specimen_count==='number'?item.specimen_count:0;
              return <li key={id} style={{marginBottom:24}}>
                <h2>Handoff {id.slice(0,8)}</h2>
                <p>Frozen specimen count: {count}. Reconcile against the physical package.</p>
                <CourierAcknowledge id={id}/>
              </li>;
            })}</ul>}
        </>}
      <p><Link href="/visits">Return to assigned visits</Link></p>
    </div></section>
  </SiteShell>;
}
