'use client';
import Link from 'next/link';
import { useRef,useState } from 'react';
import { useRouter } from 'next/navigation';
type Slot={id:string;startsAt:string;remaining:number};
export function BookingActions({id,status,paymentId,available}:{
 id:string;status:string;paymentId:string|null;available:Slot[]}){
 const router=useRouter();
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [slotId,setSlotId]=useState(available[0]?.id??'');
 const retryKey=useRef<string|null>(null);
 async function action(kind:'cancel'|'reschedule'|'reconcile'){
  if(busy)return;
  setBusy(true);setError('');setMessage('');
  try{
   const idForRoute=kind==='reconcile'?paymentId:id;
   if(!idForRoute)throw new Error('Payment reference unavailable');
   const key=kind==='reschedule'?(retryKey.current??=crypto.randomUUID()):undefined;
   const url='/api/phase2/private/bookings/'+idForRoute+'/'+kind;
   const res=await fetch(url,{
    method:'POST',headers:{'content-type':'application/json',...(key?{'idempotency-key':key}:{})},
    body:JSON.stringify(kind==='reschedule'?{slotId}:{}),credentials:'same-origin'
   });
   if(!res.ok)throw new Error(res.status===409?
    'This change requires Fisher Healthcare support review.':'The action could not be completed. Check your booking status.');
   setMessage(kind==='reconcile'?'Provider status checked. The confirmed state will appear only after payment verification.':
    'Your booking record was updated.');
   retryKey.current=null;
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:'Action unavailable');}
  finally{setBusy(false);}
 }
 return <div className="fisher-booking-actions">
  {status==='awaiting_payment'&&<section>
   <h3>Manage an unpaid booking</h3>
   <p>Cancellation and rescheduling are available only before checkout starts. Paid changes are handled by support.</p>
   <button type="button" className="fisher-button fisher-button--secondary" disabled={busy} onClick={()=>action('cancel')}>
    Cancel unpaid booking</button>
   {available.length>0&&<div>
    <label className="fisher-booking-label" htmlFor="alternative-window">Alternative collection window</label>
    <select id="alternative-window" value={slotId} onChange={e=>{setSlotId(e.target.value);retryKey.current=null;}}>
     {available.map(s=><option key={s.id} value={s.id}>
      {new Date(s.startsAt).toLocaleString('en-NG',{timeZone:'Africa/Lagos',dateStyle:'medium',timeStyle:'short'})} · {s.remaining} left
     </option>)}
    </select>
    <p><button type="button" className="fisher-button fisher-button--secondary" disabled={busy||!slotId} onClick={()=>action('reschedule')}>
     Request unpaid reschedule</button></p>
   </div>}
  </section>}
  {paymentId&&status!=='confirmed'&&status!=='completed'&&
   <p><button type="button" className="fisher-button fisher-button--secondary" disabled={busy} onClick={()=>action('reconcile')}>
    Verify payment status with Paystack</button></p>}
  <p><Link href="/support">Need cancellation, refund or payment assistance? Open a support case.</Link></p>
  {message&&<p role="status">{message}</p>}
  {error&&<p role="alert" className="fisher-planner-error">{error}</p>}
 </div>;
}
