import Link from 'next/link';
import {Notice,SiteShell} from '@fisher/ui';
import {oidcConfig,staffCourierHandoff} from '../../../lib/staff-auth';
import {CourierAcknowledge} from '../courier-acknowledge';
export const dynamic='force-dynamic';
export default async function HandoffDetails({params}:{
  params:Promise<{id:string}>
}){
  const {id}=await params;
  const handoff=await staffCourierHandoff(id);
  return <SiteShell subtitle="Courier · Physical receipt"
    navigation={[{href:'/handoffs',label:'My pending handoffs'}]}>
    <section className="fisher-section"><div className="fisher-container">
      <h1 className="fisher-section-title">Verify physical specimen handoff</h1>
      {!handoff.authorized?
        <Notice title="Handoff access restricted" tone="warning">
          Only the assigned, authenticated courier can view and acknowledge this handoff.
          {oidcConfig()&&<p><Link href="/auth/login?next=%2Fhandoffs">Courier sign in</Link></p>}
        </Notice>:
        <>
          <p>Handoff {handoff.id.slice(0,8)} · {handoff.status}</p>
          <p>Reconcile every printed specimen identifier against the physical package.
            Acknowledging attests that you have received the full frozen set.</p>
          <ul>{handoff.specimens.map(s=><li key={s.id}>
            Specimen {s.id} · {s.status}
          </li>)}</ul>
          {handoff.status==='offered'&&handoff.specimens.length?
            <CourierAcknowledge id={handoff.id} specimenIds={handoff.specimens.map(s=>s.id)}/>:
            <p role="status">This handoff is not pending acknowledgment.</p>}
          <p>The expected specimen barcode and patient identity are not provided by this view.</p>
        </>}
      <p><Link href="/handoffs">Return to courier queue</Link></p>
    </div></section>
  </SiteShell>;
}
