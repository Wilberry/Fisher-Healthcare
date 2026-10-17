'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export function RevokePatient({patientId}:{patientId:string}){
 const router=useRouter();
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function revoke(){
  if(busy||!window.confirm('Revoke your booking and result permissions for this patient? This action cannot be undone without a new verified review.'))return;
  setBusy(true);
  try{
   const r=await fetch('/api/phase2/private/revoke',{method:'POST',
    headers:{'content-type':'application/json'},body:JSON.stringify({patientId})});
   if(!r.ok)throw Error();
   setMessage('Relationship revoked. Contact support if pending payments or appointments require manual review.');
   router.refresh();
  }catch{setMessage('Could not revoke the patient relationship. Contact support.');}
  finally{setBusy(false);}
 }
 return <div>
  <button type="button" onClick={revoke} disabled={busy}
   className="fisher-button fisher-button--secondary">{busy?'Updating…':'Revoke my access to this profile'}</button>
  {message&&<p role="status">{message}</p>}
 </div>;
}
