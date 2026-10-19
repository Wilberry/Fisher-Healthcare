'use client';
import Link from 'next/link';
import { useState,type FormEvent } from 'react';
export function GuestIntake({quoteId}:{quoteId:string}){
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[consent,setConsent]=useState(false);
 const [requestId,setRequestId]=useState(''),[done,setDone]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;
  setBusy(true);setError('');
  try{
   const action=requestId?'verify':'start';
   const response=await fetch('/api/phase2/guest/'+action,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(requestId?{requestId,code}:{email:email.trim().toLowerCase(),quoteId,policyAccepted:true,policyVersion:'synthetic-2026-10'})
   });
   const data:unknown=await response.json().catch(()=>null);
   if(!response.ok||!data||typeof data!=='object')
    throw new Error('We could not verify this synthetic request. Check your code or use the authorized support channel.');
   if(action==='start' && 'requestId' in data && typeof data.requestId==='string'){
    setRequestId(data.requestId);return;
   }
   if(action==='verify' && 'status' in data && data.status==='pending_review'){
    setDone(true);return;
   }
   throw new Error('Guest request was not accepted.');
  }catch(err){setError(err instanceof Error?err.message:'Guest request unavailable');}
  finally{setBusy(false);}
 }
 if(done)return <div className="fisher-quiet-state" role="status">
  <h2>Guest contact verified</h2>
  <p>Your assisted booking request is pending staff review. No collection slot has been reserved and no payment has been processed.</p>
  <Link href="/book">Return to booking planner</Link>
 </div>;
 return <form className="fisher-patient-form" onSubmit={submit}>
  {!requestId?<>
   <label htmlFor="guest-email">Approved synthetic test email</label>
   <input id="guest-email" required type="email" maxLength={320} autoComplete="email" value={email}
    onChange={e=>setEmail(e.target.value)} />
   <p>We send a one-time verification code only to a staging-approved test inbox.</p>
   <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>
    I have read the <Link href="/policies/booking" target="_blank" rel="noreferrer">synthetic booking policy</Link>.
    I understand that this request does not reserve a slot or confirm a payment.</label>
  </>:<>
   <p>An eight-digit code was submitted to your approved test email inbox. It expires after ten minutes.</p>
   <label htmlFor="guest-code">Verification code</label>
   <input id="guest-code" inputMode="numeric" pattern="[0-9]{8}" minLength={8} maxLength={8}
    required autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)}/>
  </>}
  <button type="submit" disabled={busy||(!requestId&&!consent)} className="fisher-button fisher-button--primary">
   {busy?'Processing…':requestId?'Verify guest request':'Email a verification code'}
  </button>
  {error&&<p role="alert" className="fisher-planner-error">{error}</p>}
 </form>;
}
