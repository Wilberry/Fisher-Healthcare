'use client';
import {useRef,useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Copy={id:string;resultId:string;status:string;quoteKobo:number|null};
export function PhysicalCopyActions({patientId,results,addresses,existing}:{
 patientId:string;results:{id:string;name:string}[];
 addresses:{id:string;label:string}[];existing:Copy[]
}){
 const [resultId,setResultId]=useState(results[0]?.id??'');
 const [addressId,setAddressId]=useState(addresses[0]?.id??'');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const remembered=useRef<{key:string;payload:string}|null>(null);
 const router=useRouter();
 async function submit(e:FormEvent){
  e.preventDefault();
  if(busy||!uuid.test(resultId)||!uuid.test(addressId))return;
  const signature=JSON.stringify([resultId,addressId]);
  if(remembered.current?.payload!==signature)
   remembered.current={key:crypto.randomUUID(),payload:signature};
  const key=remembered.current.key;
  setBusy(true);setMessage('');
  try{
   const reply=await fetch('/api/phase4/patients/'+patientId+'/physical-copies',{
     method:'POST',credentials:'same-origin',cache:'no-store',
     headers:{'content-type':'application/json'},
     body:JSON.stringify({resultId,addressId,requestKey:key})
   });
   if(reply.ok){
     remembered.current=null;setMessage('Request recorded for a quote; no payment or delivery started.');
     router.refresh();
   }else setMessage(reply.status===409?'A request already exists. Refresh the list.':
     'Physical-copy request not confirmed. Review the list before retrying.');
  }catch{setMessage('Network outcome unknown. Check the request list before retrying.');}
  finally{setBusy(false);}
 }
 async function cancel(copyId:string){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const res=await fetch('/api/phase4/patients/'+patientId+'/physical-copies/'+copyId+'/cancel',{
     method:'POST',credentials:'same-origin',cache:'no-store',
     headers:{'content-type':'application/json'},body:'{}'
   });
   setMessage(res.ok?'Request cancelled. Refreshing.':
     'Cancellation not confirmed; a quoted request cannot be cancelled here.');
   if(res.ok)router.refresh();
  }catch{setMessage('Cancellation outcome unknown. Check the list before retrying.');}
  finally{setBusy(false);}
 }
 return <section aria-label="Optional physical report copy">
  <h3>Optional physical copy — synthetic quotation</h3>
  <p>A verified address and an authorized released result are required.
    Submitting does not charge you or schedule delivery.</p>
  {results.length&&addresses.length?
   <form onSubmit={e=>void submit(e)}>
    <p><label>Released result
     <select value={resultId} onChange={e=>setResultId(e.target.value)}>
      {results.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}
     </select></label></p>
    <p><label>Verified delivery address
     <select value={addressId} onChange={e=>setAddressId(e.target.value)}>
      {addresses.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}
     </select></label></p>
    <button type="submit" disabled={busy}>Request physical-copy quote</button>
   </form>:
   <p>A released result and a verified address are needed to request a quote.</p>}
  <ul>{existing.map(item=><li key={item.id}>
   Request {item.id.slice(0,8)} · {item.status}
   {item.quoteKobo!==null?' · ₦'+(item.quoteKobo/100).toFixed(2):''}
   {item.status==='requested'&&<button type="button" disabled={busy}
     onClick={()=>void cancel(item.id)}>Cancel request</button>}
  </li>)}</ul>
  <p role="status" aria-live="polite">{message}</p>
 </section>;
}
