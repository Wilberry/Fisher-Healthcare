'use client';
import { useRef, useState } from 'react';
type Profile={id:string;label:string;addresses:{id:string;label:string}[]};
type Props={quoteId:string;eligible:Profile[];paymentAvailable:boolean};
async function post(path:string,body:unknown,key?:string){
 const reply=await fetch(path,{method:'POST',headers:{'content-type':'application/json',
  ...(key?{'idempotency-key':key}:{})},body:JSON.stringify(body),credentials:'same-origin'});
 const data:unknown=await reply.json().catch(()=>null);
 if(!reply.ok)throw new Error(reply.status===409?'This quotation or collection window is no longer available. Please restart the booking.':
  reply.status===401?'Your session expired. Please sign in again.':'Could not complete this step. No booking should be assumed.');
 return data as Record<string,unknown>;
}
export function BookingConfirmation({quoteId,eligible,paymentAvailable}:Props){
 const [patientId,setPatientId]=useState(eligible[0]?.id??'');
 const availableAddresses=eligible.find(p=>p.id===patientId)?.addresses??[];
 const [addressId,setAddressId]=useState(eligible[0]?.addresses[0]?.id??'');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [created,setCreated]=useState<{bookingId:string;status:string}|null>(null);
 const [checkout,setCheckout]=useState('');
 const checkoutKey=useRef<string|null>(null);
 async function commit(){
  if(busy||!patientId||created)return;
  setBusy(true);setError('');
  try{
   const draft=await post('/api/phase2/private/draft',{quoteId,patientId,addressId});
   if(typeof draft.draftId!=='string')throw new Error('Draft creation incomplete');
   const booking=await post('/api/phase2/private/commit',{draftId:draft.draftId},crypto.randomUUID());
   if(typeof booking.bookingId!=='string'||typeof booking.status!=='string')
    throw new Error('Unable to confirm booking status');
   setCreated({bookingId:booking.bookingId,status:booking.status});
  }catch(e){setError(e instanceof Error?e.message:'Booking unavailable');}
  finally{setBusy(false);}
 }
 async function startCheckout(){
  if(busy||!created)return;
  setBusy(true);setError('');
  try{
   checkoutKey.current??=crypto.randomUUID();
   const result=await post('/api/phase2/private/checkout',{bookingId:created.bookingId},checkoutKey.current);
   if(typeof result.authorizationUrl!=='string'||!result.authorizationUrl.startsWith('https://checkout.paystack.com/'))
    throw new Error('Trusted checkout link unavailable');
   setCheckout(result.authorizationUrl);
  }catch(e){setError(e instanceof Error?e.message:'Checkout unavailable');}
  finally{setBusy(false);}
 }
 return <div className="fisher-booking-planner">
  {!created?<fieldset><legend>Authorized patient</legend>
   <label className="fisher-booking-label" htmlFor="patient">Who is the appointment for?</label>
   <select id="patient" value={patientId} onChange={e=>{
     const next=e.target.value;setPatientId(next);
     setAddressId(eligible.find(v=>v.id===next)?.addresses[0]?.id??'');
    }}>
    {eligible.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
   </select>
   <label className="fisher-booking-label" htmlFor="collection-address">Verified collection location</label>
   <select id="collection-address" value={addressId} onChange={e=>setAddressId(e.target.value)}>
    {availableAddresses.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}
   </select>
   <p>Quotation validity and slot capacity will be checked again on the server. Payment is never inferred from a browser redirect.</p>
   <button type="button" className="fisher-button fisher-button--primary" disabled={busy||!patientId||!addressId} onClick={commit}>
    {busy?'Reserving…':'Reserve collection and create booking'}</button>
  </fieldset>:
   <div className="fisher-quote" aria-live="polite">
    <h2>Booking created</h2>
    <p>Reference: <strong>{created.bookingId.slice(0,8).toUpperCase()}</strong></p>
    <p>Current status: {created.status.replaceAll('_',' ')}. A booking is not confirmed until verified payment succeeds.</p>
    <a href={'/account/bookings/'+created.bookingId}>View your booking</a>
    {paymentAvailable&&!checkout&&<p><button type="button" className="fisher-button fisher-button--secondary" disabled={busy} onClick={startCheckout}>Proceed to Paystack sandbox checkout</button></p>}
    {checkout&&<p><a className="fisher-button fisher-button--primary" href={checkout} rel="noreferrer">Open Paystack test checkout</a></p>}
    {!paymentAvailable&&<p>Payment remains disabled until staging checkout has been approved and configured.</p>}
   </div>}
  {error&&<p role="alert" className="fisher-planner-error">{error}</p>}
 </div>;
}
