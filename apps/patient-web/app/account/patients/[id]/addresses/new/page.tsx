import { Notice, SiteShell } from '@fisher/ui';
import { patientAccountData } from '../../../../../../lib/patient-api';
import { zones } from '../../../../../../lib/public-api';
import { AddressRequestForm } from './request-form';
export const dynamic='force-dynamic';
export default async function RequestAddress({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const account=await patientAccountData();
 const patient=account.patients.find(p=>p.id===id&&p.can_book&&p.verified);
 const areas=patient?await zones():[];
 return <SiteShell subtitle="Collection location" navigation={[
  {href:'/account',label:'My account'},{href:'/book',label:'Booking planner'}
 ]}>
  <section className="fisher-section"><div className="fisher-container">
   <h1 className="fisher-section-title">Request collection address verification</h1>
   <Notice title="Synthetic development only">Do not enter your actual home, workplace or medical information while the Phase 2 system is under development. Selecting a service zone does not confirm collection coverage.</Notice>
   {!account.signedIn?<a href={'/auth/login?next='+encodeURIComponent('/account/patients/'+id+'/addresses/new')} className="fisher-button fisher-button--primary">Sign in</a>:
    !patient?<Notice title="Patient authorization required">The selected patient is not currently approved for booking under this account.</Notice>:
    !areas.length?<Notice title="Zones not configured">No reviewed synthetic service zone is currently enabled.</Notice>:
     <AddressRequestForm patientId={id} patientName={patient.display_name} zones={areas}/>}
  </div></section>
 </SiteShell>;
}
