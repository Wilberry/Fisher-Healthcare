import { Notice, SiteShell } from '@fisher/ui';
import { quoteDetail } from '../../../lib/public-api';
import { GuestIntake } from './guest-intake';
export const dynamic='force-dynamic';
export default async function GuestBooking({searchParams}:{searchParams:Promise<{quoteId?:string}>}){
 const quoteId=(await searchParams).quoteId??'';
 const quote=await quoteDetail(quoteId);
 return <SiteShell subtitle="Guest-assisted booking" navigation={[
  {href:'/book',label:'Booking planner'},{href:'/account',label:'My account'}
 ]}>
  <section className="fisher-section"><div className="fisher-container">
   <h1 className="fisher-section-title">Continue as a guest</h1>
   <p className="fisher-lead">Verify your contact email and request help to complete an appointment without signing in.</p>
   <Notice title="Assisted booking only">A guest request does not reserve a collection slot, approve a patient profile or charge any payment. A staff member must verify identity, collection coverage and patient authority before confirming an appointment. Synthetic test recipients only.</Notice>
   {!quote?<Notice title="Quotation unavailable">Return to the planner to select a fresh test quotation.</Notice>:
    <GuestIntake quoteId={quoteId}/>}
  </div></section>
 </SiteShell>;
}
