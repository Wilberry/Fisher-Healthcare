import { Notice, SiteShell } from '@fisher/ui';
import { patientAccountData, patientApi } from '../../../lib/patient-api';
import { quoteDetail } from '../../../lib/public-api';
import { readSession } from '../../../lib/patient-auth';
import { BookingConfirmation } from './confirmation';
export const dynamic='force-dynamic';
export default async function Confirm({searchParams}:{searchParams:Promise<{quoteId?:string}>}){
 const quoteId=(await searchParams).quoteId??'';
 const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteId);
 const quote=valid?await quoteDetail(quoteId):null;
 const session=await readSession();
 const account=session?await patientAccountData():null;
 const eligible=account?.patients.filter(v=>v.verified&&v.can_book)??[];
 const choices=quote && account?.available?
  await Promise.all(eligible.map(async patient=>{
   const r=await patientApi('patients/'+patient.id+'/addresses');
   const items=r.ok && r.data && typeof r.data==='object' && 'data' in r.data &&
     Array.isArray(r.data.data)?r.data.data:[];
   const addresses=items.filter((v):v is Record<string,unknown> =>
     !!v&&typeof v==='object'&&!Array.isArray(v)).filter(v=>
      v.verified===true && v.zone_id===quote.zone_id &&
      typeof v.id==='string'&&typeof v.label==='string').map(v=>({
       id:v.id as string,label:v.label as string
      }));
   return {id:patient.id,label:patient.display_name,addresses};
  })):[];\n const hasVerifiedAddress=choices.some(v=>v.addresses.length>0);\n const paymentAvailable=process.env.FISHER_PHASE2_BOOKING_MODE==='synthetic' &&
 process.env.FISHER_PHASE2_PAYMENT_MODE==='staging' && process.env.NODE_ENV!=='production';
 return <SiteShell subtitle="Finalize an appointment" navigation={[
  {href:'/book',label:'Booking planner'},{href:'/account',label:'My account'}
 ]}>
  <section className="fisher-section"><div className="fisher-container">
   <h1 className="fisher-section-title">Confirm patient and collection</h1>
   {!quote?<Notice title="Invalid or expired quotation">Return to the booking planner to obtain a fresh quote.</Notice>:
   !session?<div>
    <Notice title="Verify your identity">To reserve a slot, you must sign in and have current booking authority for the patient.</Notice>
    <a href={'/auth/login?next='+encodeURIComponent('/book/confirm?quoteId='+quoteId)} className="fisher-button fisher-button--primary">Sign in to continue</a>
   </div>:!account?.available?<Notice title="Account unavailable">The patient service could not verify your account. Please try again after the service is available.</Notice>:
   eligible.length===0?<Notice title="Patient authorization required">No approved patient booking profile is linked to this account. Submit a patient profile for verification or contact Fisher Healthcare support. Creating a profile does not grant permission.</Notice>:
   !hasVerifiedAddress?<div>
    <Notice title="Collection location verification required">No approved collection address is linked to these patients in the quoted service zone. Add a synthetic collection address for coverage review before committing the booking.</Notice>
    <a href={'/account/patients/'+eligible[0]!.id+'/addresses/new'} className="fisher-button fisher-button--secondary">Request address verification</a>
   </div>:
    <BookingConfirmation quoteId={quoteId} eligible={choices.filter(v=>v.addresses.length>0)} paymentAvailable={paymentAvailable}/>}
  </div></section>
 </SiteShell>;
}
