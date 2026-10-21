'use client';
import {useState,type FormEvent} from 'react';
import {useRouter} from 'next/navigation';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function ResultActions({pending,canIntake,canRelease}:{
  pending:{id:string}[];canIntake:boolean;canRelease:boolean
}){
 const [item,setItem]=useState(''),[specimen,setSpecimen]=useState('');
 const [key,setKey]=useState(''),[checksum,setChecksum]=useState('');
 const [validation,setValidation]=useState('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const router=useRouter();
 async function post(path:string,payload:Record<string,unknown>){
  if(busy)return;
  setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/phase4/'+path,{
    method:'POST',credentials:'same-origin',cache:'no-store',
    headers:{'content-type':'application/json'},body:JSON.stringify(payload)
   });
   if(!response.ok){
    setMessage(response.status===401?'Staff login expired.':
      response.status===403?'Your current staff role is not authorized.':
      response.status===409?'A conflicting or already-recorded action exists. Review the current record.':
      'Operation not confirmed. Check its status before retrying.');
   }else{
    setMessage('Synthetic operation recorded. Refreshing.');
    router.refresh();
   }
  }catch{setMessage('Network outcome unknown. Refresh before retrying.');}
  finally{setBusy(false);}
 }
 function intake(e:FormEvent){
  e.preventDefault();
  if(![item,specimen,key].every(v=>uuid.test(v))||!/^[a-f0-9]{64}$/.test(checksum)||
    !/^SYN-[A-Z0-9-]{8,64}$/.test(validation))return;
  void post('ops/results/intake',{orderItemId:item,specimenId:specimen,intakeKey:key,
    objectKey:'synthetic/results/'+key+'.pdf',documentSha256:checksum,
    validationReference:validation});
 }
 return <section aria-label="Phase 4 result administration">
   {canIntake&&<><h2>Record a synthetic validated intake</h2>
   <form onSubmit={intake}>
    <p><label>Ordered test UUID <input required value={item} maxLength={36}
      onChange={e=>setItem(e.target.value)}/></label></p>
    <p><label>Accepted specimen UUID <input required value={specimen} maxLength={36}
      onChange={e=>setSpecimen(e.target.value)}/></label></p>
    <p><label>Stable intake UUID <input required value={key} maxLength={36}
      onChange={e=>setKey(e.target.value)}/></label>
      <button type="button" onClick={()=>setKey(crypto.randomUUID())}>Create key</button></p>
    <p><label>Approved synthetic document SHA-256 <input required value={checksum}
      maxLength={64} onChange={e=>setChecksum(e.target.value)}/></label></p>
    <p><label>Synthetic validation reference <input required value={validation}
      maxLength={68} onChange={e=>setValidation(e.target.value)}/></label></p>
    <button type="submit" disabled={busy}>Record intake</button>
   </form>
   </>}
   {canRelease&&<><h2>Independent release review</h2>
   {pending.length?<ul>{pending.map(result=>
    <li key={result.id}><span>Result {result.id}</span>{' '}
     <button type="button" disabled={busy}
       onClick={()=>void post('ops/results/'+result.id+'/release',{
         releaseKey:crypto.randomUUID()})}>Release after authorized review</button>
    </li>)}</ul>:<p>No pending releases.</p>}
   </>}
   <p role="status" aria-live="polite">{message}</p>
 </section>;
}
