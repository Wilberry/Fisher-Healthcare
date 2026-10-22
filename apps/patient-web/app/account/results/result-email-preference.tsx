'use client';
import {useState} from 'react';
export function ResultEmailPreference({patientId,initiallyEnabled}:{
  patientId:string;initiallyEnabled:boolean
}){
 const [enabled,setEnabled]=useState(initiallyEnabled);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function change(){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const res=await fetch('/api/phase4/patients/'+patientId+'/result-email-preference',{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'content-type':'application/json'},body:JSON.stringify({enabled:!enabled})
   });
   if(!res.ok){setMessage('Preference not confirmed. Sign in again or check patient permissions.');return;}
   setEnabled(!enabled);
   setMessage('Result email preference saved.');
  }catch{setMessage('Unable to confirm the change. Check your account before retrying.');}
  finally{setBusy(false);}
 }
 return <div>
   <p>Result availability email: <strong>{enabled?'Enabled':'Disabled'}</strong></p>
   <button type="button" disabled={busy} onClick={()=>void change()}>
     {busy?'Saving…':enabled?'Disable email alerts':'Enable email alerts'}
   </button>
   <p role="status" aria-live="polite">{message}</p>
 </div>;
}
