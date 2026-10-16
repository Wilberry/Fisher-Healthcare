import { Notice, SiteShell } from '@fisher/ui';
import { patientAccountData } from '../../../lib/patient-api';
import { readSession } from '../../../lib/patient-auth';
import { BookingConfirmation } from './confirmation';
export const dynamic='force-dynamic';
export default async function Confirm({searchParams}:{searchParams:Promise<{quoteId?:string}>}){
 const quoteId=(await searchParams).quoteId??'';
 const valid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteId);
 const session=await readSession();
 const account=session?await patientAccountData():null;
 const eligible=account?.patients.filter(v=>v.verified&&v.can_book)??[];
 const paymentAvailable=process.env.FISHER_PHASE2_BOOKING_MODE==='synthetic' &&
 process.env.FISHER_PHASE2_PAYMENT_MODE==='staging' && process.env.NODE_ENV!=='production';
 return <SiteShell subtitle="Finalize an appointment" navigation={[
  {href:'/book',label:'Booking planner'},{href:'/account',label:'My account'}
 ]}>
  <section className="fisher-section"><div className="fisher-container">
   <h1 className="fisher-section-title">Confirm patient and collection</h1>
   {!valid?<Notice title="Invalid quotation">Return to the booking planner to obtain a fresh quote.</Notice>:
   !session?<div>
    <Notice title="Verify your identity">To reserve a slot, you must sign in and have current booking authority for the patient.</Notice>
    <a href={'/auth/login?next='+encodeURIComponent('/book/confirm?quoteId='+quoteId)} className="fisher-button fisher-button--primary">Sign in to continue</a>
   </div>:!account?.available?<Notice title="Account unavailable">The patient service could not verify your account. Please try again after the service is available.</Notice>:
   eligible.length===0?<Notice title="Patient authorization required">No approved patient booking profile is linked to this account. Submit a patient profile for verification or contact Fisher Healthcare support. Creating a profile does not grant permission.</Notice>:
    <BookingConfirmation quoteId={quoteId} eligible={eligible.map(v=>({id:v.id,label:v.display_name}))} paymentAvailable={paymentAvailable}/>}
  </div></section>
 </SiteShell>;
}
