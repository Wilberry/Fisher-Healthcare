'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
type Code='custody_incidents'|'outbox_dead_letters'|'result_email_failures';
type Alert={code:Code;status:'open'|'acknowledged'|'resolved';count:number};
const names:Record<Code,string>={
 custody_incidents:'Unresolved custody incidents',
 outbox_dead_letters:'Dead-letter background jobs',
 result_email_failures:'Failed result availability notifications'
};
export function ReadinessAlertActions({alerts}:{alerts:Alert[]}){
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const router=useRouter();
 async function post(path:string){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/phase5/'+path,{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'content-type':'application/json'},body:'{}'
   });
   if(response.ok){
    setMessage('Synthetic alert state recorded. Refreshing.');
    router.refresh();
   }else{
    setMessage('Alert action not confirmed. Check current status before retrying.');
   }
  }catch{
   setMessage('Network outcome unknown. Review alerts before retrying.');
  }finally{setBusy(false);}
 }
 return <div>
  <button type="button" disabled={busy} onClick={()=>void post('evaluate')}>
    Evaluate current synthetic counts
  </button>
  <ul>{alerts.map(row=><li key={row.code}>
    {names[row.code]} — {row.status}, count {row.count}
    {row.status==='open'&&<button type="button" disabled={busy}
     onClick={()=>void post('alerts/'+row.code+'/acknowledge')}>
     Acknowledge investigation</button>}
  </li>)}</ul>
  {alerts.length===0&&<p>No evaluated alert records yet. Run synthetic evaluation to initialize them.</p>}
  <p role="status" aria-live="polite">{message}</p>
 </div>;
}
