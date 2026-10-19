import Link from 'next/link';
import {Notice,SiteShell} from '@fisher/ui';
import {oidcConfig,staffApi} from '../../lib/staff-auth';
import {LabAccessActions} from './lab-access-actions';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function LaboratoryStaffAdministration(){
  const [pending,active]=await Promise.all([
    staffApi('ops/labs/access-requests'),staffApi('ops/labs/access')
  ]);
  const permitted=pending.authorized&&active.authorized;
  const requests=(permitted?pending.records:[]).flatMap(item=>{
    if(typeof item.id!=='string'||!uuid.test(item.id)||
       typeof item.lab_id!=='string'||!uuid.test(item.lab_id)||
       typeof item.staff_id!=='string'||!uuid.test(item.staff_id))return [];
    return [{id:item.id,labId:item.lab_id,staffId:item.staff_id,
      reason:typeof item.reason==='string'?item.reason:'Internal access request',
      requestedBy:typeof item.requested_by==='string'?item.requested_by:''}];
  });
  const grants=(permitted?active.records:[]).flatMap(item=>{
    if(typeof item.lab_id!=='string'||!uuid.test(item.lab_id)||
       typeof item.staff_id!=='string'||!uuid.test(item.staff_id))return [];
    return [{labId:item.lab_id,staffId:item.staff_id}];
  });
  return <SiteShell subtitle="Operations · Internal lab onboarding"
    navigation={[{href:'/dispatch',label:'Dispatch'}]}>
    <section className="fisher-section"><div className="fisher-container">
      <p className="fisher-eyebrow">Phase 3 · Dual-control administration</p>
      <h1 className="fisher-section-title">Laboratory staff access</h1>
      {!permitted?
        <Notice title="Administrator access required" tone="warning">
          Lab grant administration is restricted to active administrators with staff management access.
          {oidcConfig()&&<p><Link href="/auth/login?next=%2Flab-access">Administrator sign in</Link></p>}
        </Notice>:
        <>
          <p>Only approved, active laboratory coordinator grants authorize receipt.
             The requester cannot approve their own grant; all changes are audited.</p>
          <LabAccessActions pending={requests} active={grants}/>
        </>}
      <p><Link href="/dispatch">Return to dispatch</Link></p>
    </div></section>
  </SiteShell>;
}
