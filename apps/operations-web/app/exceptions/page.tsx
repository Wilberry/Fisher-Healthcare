import Link from 'next/link';
import {Notice,SiteShell} from '@fisher/ui';
import {staffApi,oidcConfig} from '../../lib/staff-auth';
import {ReviewIncident} from './review-incident';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function Exceptions(){
  const incidents=await staffApi('ops/exceptions');
  return <SiteShell subtitle="Operations · Incident review"
    navigation={[{href:'/dispatch',label:'Dispatch'}]}>
    <section className="fisher-section"><div className="fisher-container">
      <p className="fisher-eyebrow">Phase 3 · Chain-of-custody exceptions</p>
      <h1 className="fisher-section-title">Open specimen incidents</h1>
      {!incidents.authorized?
        <Notice title="Dispatcher sign-in required" tone="warning">
          Incident details are restricted to authorized dispatch staff.
          {oidcConfig()&&<p><Link href="/auth/login?next=%2Fexceptions">Staff sign in</Link></p>}
        </Notice>:
        <>
          <p>Exception resolution requires a written review note.
            Unresolved incidents block onward custody.</p>
          {!incidents.records.length?<p role="status">No open incidents.</p>:
            <ul>{incidents.records.map(item=>{
              const id=typeof item.id==='string'?item.id:'';
              const kind=typeof item.kind==='string'?item.kind:'unspecified';
              const specimen=typeof item.specimen_id==='string'?item.specimen_id:'';
              if(!uuid.test(id))return null;
              return <li key={id} style={{marginBottom:28}}>
                <h2>Incident {id.slice(0,8)}</h2>
                <p>Type: {kind.replaceAll('_',' ')} · Specimen reference: {specimen.slice(0,8)}</p>
                <ReviewIncident id={id}/>
              </li>;
            })}</ul>}
        </>}
      <p><Link href="/dispatch">Return to dispatch</Link></p>
    </div></section>
  </SiteShell>;
}
