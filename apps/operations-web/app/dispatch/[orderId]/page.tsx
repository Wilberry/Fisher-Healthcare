import Link from 'next/link';
import {Notice,SiteShell} from '@fisher/ui';
import {oidcConfig,staffApi} from '../../../lib/staff-auth';
import {AssignCollector} from './assign-collector';

export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function AssignmentPlanner({params}:{
  params:Promise<{orderId:string}>
}){
  const {orderId}=await params;
  const valid=uuid.test(orderId);
  const shifts=valid?await staffApi('ops/assignments/eligible-shifts/'+orderId.toLowerCase()):null;
  const eligible=(shifts?.authorized?shifts.records:[]).flatMap(entry=>{
    if(typeof entry.id!=='string'||!uuid.test(entry.id)||
       typeof entry.staff_id!=='string'||!uuid.test(entry.staff_id)||
       typeof entry.zone_code!=='string')return [];
    return [{shiftId:entry.id,staffId:entry.staff_id,zone:entry.zone_code,
      start:typeof entry.starts_at==='string'?entry.starts_at:''}];
  });
  return <SiteShell subtitle="Dispatch · Collector assignment"
    navigation={[{href:'/dispatch',label:'Dispatch'}]}>
    <section className="fisher-section"><div className="fisher-container">
      <p className="fisher-eyebrow">Phase 3 · Controlled dispatch</p>
      <h1 className="fisher-section-title">Assign a collector</h1>
      {!valid||!shifts?.authorized?
        <Notice title="Dispatch identity required" tone="warning">
          This order is not available to your current staff session.
          {oidcConfig()&&<p><Link href="/auth/login?next=%2Fdispatch">Staff sign in</Link></p>}
        </Notice>:
        <>
          <p>Order reference: {orderId.slice(0,8)}. Only currently eligible shift IDs
            are shown; patient identity and contact details are not loaded.</p>
          <AssignCollector orderId={orderId.toLowerCase()} shifts={eligible}/>
        </>}
      <p><Link href="/dispatch">Back to dispatch queue</Link></p>
    </div></section>
  </SiteShell>;
}
