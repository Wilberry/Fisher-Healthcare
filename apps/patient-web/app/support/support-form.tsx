'use client';
import { useRef, useState, type FormEvent } from 'react';
export function SupportRequestForm(){
 const [category,setCategory]=useState('booking'),[preferredContact,setPreferredContact]=useState('email');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[caseId,setCaseId]=useState('');
 const idempotency=useRef<string|null>(null);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy||caseId)return;setBusy(true);setMessage('');
  idempotency.current??=crypto.randomUUID();
  try{
   const r=await fetch('/api/phase2/private/support',{method:'POST',headers:{
    'content-type':'application/json','idempotency-key':idempotency.current
   },body:JSON.stringify({category,preferredContact})});
   const data:unknown=await r.json().catch(()=>null);
   if(!r.ok||!data||typeof data!=='object'||!('caseId' in data)||typeof data.caseId!=='string')
    throw new Error('We could not save this support request.');
   setCaseId(data.caseId);
  }catch(e){setMessage(e instanceof Error?e.message:'Assistance request unavailable');}
  finally{setBusy(false);}
 }
 if(caseId)return <div role="status" className="fisher-quiet-state">
  <h2>Support case recorded</h2><p>Case reference: {caseId.slice(0,8).toUpperCase()}</p>
  <p>Request status: open. No email or WhatsApp delivery has been claimed.</p>
  <a href="/account">View account</a>
 </div>;
 return <form onSubmit={submit} className="fisher-patient-form">
  <label htmlFor="support-category">What do you need help with?</label>
  <select id="support-category" value={category} onChange={e=>{setCategory(e.target.value);idempotency.current=null;}}>
   <option value="booking">Booking query</option>
   <option value="payment">Payment query</option>
   <option value="reschedule">Rescheduling</option>
   <option value="account_access">Account access</option>
  </select>
  <label htmlFor="support-contact">Preferred future response channel</label>
  <select id="support-contact" value={preferredContact} onChange={e=>{setPreferredContact(e.target.value);idempotency.current=null;}}>
   <option value="email">Email</option><option value="whatsapp">WhatsApp (once approved)</option>
  </select>
  <p>No diagnosis, medical details, personal identity documents or payment card information should be entered here.</p>
  <button type="submit" disabled={busy} className="fisher-button fisher-button--primary">{busy?'Submitting…':'Create support request'}</button>
  {message&&<p role="alert" className="fisher-planner-error">{message}</p>}
 </form>;
}
