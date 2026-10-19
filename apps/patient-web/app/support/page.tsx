import Link from 'next/link';
import { Notice, SiteShell } from '@fisher/ui';
import { readSession } from '../../lib/patient-auth';
import { SupportRequestForm } from './support-form';
export const dynamic='force-dynamic';
export default async function SupportPage(){
 const session=await readSession();
 return <SiteShell subtitle="Customer assistance" navigation={[
  {href:'/',label:'Home'},{href:'/book',label:'Booking planner'},{href:'/account',label:'My account'}
 ]}>
  <section className="fisher-section"><div className="fisher-container">
   <p className="fisher-eyebrow">Bookings and account assistance</p>
   <h1 className="fisher-section-title">Request help from Fisher Healthcare</h1>
   <p className="fisher-lead">Our team can review questions about scheduling, payment or account access when the service is operational.</p>
   <Notice title="Assisted intake preview">Requests in this development environment are synthetic and do not contact a person. Selecting WhatsApp is a preference only; it does not send a message or imply WhatsApp service is active. Do not submit real health information.</Notice>
   {!session?<Link className="fisher-button fisher-button--primary" href="/auth/login?next=%2Fsupport">Sign in to request help</Link>:
    <SupportRequestForm/>}
  </div></section>
 </SiteShell>;
}
