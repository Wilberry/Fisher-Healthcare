import { Notice, SiteShell } from '@fisher/ui';
import { patientApi } from '../../../../../lib/patient-api';
import { naira } from '../../../../../lib/public-api';
export const dynamic='force-dynamic';
export default async function Receipt({params}:{params:Promise<{id:string}>}){
 const {id}=await params;
 const response=/^[0-9a-f-]{36}$/i.test(id)?await patientApi('bookings/'+id+'/receipt'):null;
 const record=response?.ok&&response.data&&typeof response.data==='object'&&
  'data' in response.data&&response.data.data&&typeof response.data.data==='object'
  ?response.data.data as Record<string,unknown>:null;
 return <SiteShell subtitle="Payment receipt" navigation={[{href:'/account',label:'My account'}]}>
  <section className="fisher-section"><div className="fisher-container">
   <a href={'/account/bookings/'+id}>← Booking details</a><h1 className="fisher-section-title">Payment receipt</h1>
   {!record?<Notice title="Receipt not available">The payment is not verified, the booking is unavailable, or your current account does not have access.</Notice>:
    <div className="fisher-quiet-state">
     <h2>Fisher Healthcare · Synthetic Payment Receipt</h2>
     <p><strong>Booking:</strong> {String(record.booking_id)}</p>
     <p><strong>Amount:</strong> {typeof record.total_kobo==='number'?naira(record.total_kobo):'Unavailable'}</p>
     <p><strong>Currency:</strong> {String(record.currency)}</p>
     <p><strong>Tier:</strong> {String(record.tier)}</p>
     <p><strong>Provider reference:</strong> {String(record.provider_reference)}</p>
     <p><strong>Verified settlement record:</strong> {String(record.paid_at)}</p>
     <p>This receipt records test-mode verification only; it is not evidence of a live customer payment.</p>
    </div>}
  </div></section>
 </SiteShell>;
}
