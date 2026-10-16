import { Notice, SiteShell } from '@fisher/ui';
import { readSession } from '../../../../lib/patient-auth';
import { patientApi } from '../../../../lib/patient-api';
import { naira } from '../../../../lib/public-api';
export const dynamic='force-dynamic';
export default async function BookingDetail({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
 const signedIn=await readSession();
 const response=valid&&signedIn?await patientApi('bookings/'+id):null;
 const data=response?.ok && response.data && typeof response.data==='object' &&
  'data' in response.data?response.data.data as Record<string,unknown>:null;
 return <SiteShell subtitle="Booking details" navigation={[
  {href:'/account',label:'My account'},{href:'/book',label:'New booking'}
 ]}>
  <section className="fisher-section"><div className="fisher-container">
   <a href="/account">← Back to account</a>
   <h1 className="fisher-section-title">Booking details</h1>
   {!signedIn?<Notice title="Sign-in required">Please sign in again to access your booking records.</Notice>:
    !data?<Notice title="Booking unavailable">This booking is not found or cannot be accessed with your current permissions.</Notice>:
    <div className="fisher-quiet-state">
     <h2>Booking {String(data.id).slice(0,8).toUpperCase()}</h2>
     <p><strong>Status:</strong> {String(data.status).replaceAll('_',' ')}</p>
     <p><strong>Service:</strong> {String(data.tier)}</p>
     <p><strong>Amount:</strong> {typeof data.total_kobo==='number'?naira(data.total_kobo):'Not available'}</p>
     {typeof data.collection_window_start==='string'&&
      <p><strong>Collection:</strong> {new Date(data.collection_window_start).toLocaleString('en-NG',{timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'short'})}</p>}
     <p>Only verified payments can confirm bookings. Tracking and laboratory milestones are added in later delivery phases.</p>
    </div>}
  </div></section>
 </SiteShell>;
}
