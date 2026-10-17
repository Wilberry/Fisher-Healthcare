import { Notice, SiteShell } from '@fisher/ui';
import { readSession } from '../../../../lib/patient-auth';
import { patientApi } from '../../../../lib/patient-api';
import { naira } from '../../../../lib/public-api';
import { BookingActions } from './booking-actions';
export const dynamic='force-dynamic';
export default async function BookingDetail({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
 const signedIn=await readSession();
 const response=valid&&signedIn?await patientApi('bookings/'+id):null;
 const data=response?.ok && response.data && typeof response.data==='object' &&
  'data' in response.data?response.data.data as Record<string,unknown>:null;
 let slots:{id:string;startsAt:string;remaining:number}[]=[];
 if(data?.status==='awaiting_payment' && typeof data.zone_id==='string' && typeof data.lab_id==='string'
   && (data.tier==='regular'||data.tier==='premium')){
  try{
   const root=process.env.FISHER_API_SERVER_URL;
   if(root){
    const target=new URL('/api/v1/availability/search',root);
    const r=await fetch(target,{method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify({zoneId:data.zone_id,labId:data.lab_id,serviceTier:data.tier}),
     cache:'no-store',signal:AbortSignal.timeout(5000)});
    const payload:unknown=await r.json();
    if(r.ok&&payload&&typeof payload==='object'&&'data' in payload&&Array.isArray(payload.data)){
     slots=payload.data.filter((v):v is {id:string;startsAt:string;remaining:number} =>
      !!v&&typeof v==='object'&&typeof v.id==='string'&&typeof v.startsAt==='string'&&
       typeof v.remaining==='number'&&v.id!==data.slot_id);
    }
   }
  }catch{/* Fail closed with no available schedule alternatives. */}
 }
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
     {typeof data.payment_status==='string'&&<p><strong>Payment:</strong> {data.payment_status}</p>}
     {typeof data.payment_expires_at==='string'&&data.status==='awaiting_payment'&&
      <p><strong>Payment deadline:</strong> {new Date(data.payment_expires_at).toLocaleString('en-NG',{timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'short'})}</p>}
     {['confirmed','assigned','collected','completed'].includes(String(data.status))&&
      <p><a href={'/account/bookings/'+id+'/receipt'}>View verified payment receipt</a></p>}
     <BookingActions id={id} status={String(data.status)} paymentId={typeof data.payment_id==='string'?data.payment_id:null} available={slots}/>
     <p>Only verified payments can confirm bookings. Laboratory results are governed by a separate release and permission process.</p>
    </div>}
  </div></section>
 </SiteShell>;
}
