'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export type ActionKind='patient-approve'|'address-approve'|'guest-assign'|
 'support-assign'|'support-resolve'|'payment-ack'|'catalog-approve';
export function StaffAction({id,action,resourceType}:{
 id:string;action:ActionKind;resourceType?:string}){
 const [reference,setReference]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const router=useRouter();
 async function submit(){
  if(busy)return;setBusy(true);setError('');
  try{
   const response=await fetch('/api/phase2/staff/'+action,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({id,evidenceReference:reference.trim(),...(resourceType?{resourceType}:{})})});
   if(!response.ok)throw new Error(response.status===403?'MFA or staff permissions missing':
     response.status===409?'This review is no longer eligible. Refresh the queue.':'Review was not completed.');
   setReference('');router.refresh();
  }catch(err){setError(err instanceof Error?err.message:'Review failed');}
  finally{setBusy(false);}
 }
 return <div className="fisher-staff-action">
  <label>Reviewed evidence reference (synthetic only)
   <input required minLength={10} maxLength={128} placeholder="synthetic-evidence-ref-001"
    value={reference} onChange={e=>setReference(e.target.value)}/>
  </label>
  <button type="button" className="fisher-button fisher-button--secondary"
   disabled={busy||!/^[A-Za-z0-9._:-]{10,128}$/.test(reference.trim())} onClick={submit}>
   {busy?'Submitting…':'Submit '+action.replaceAll('-',' ')}
  </button>
  {error&&<p role="alert" className="fisher-planner-error">{error}</p>}
 </div>;
}
