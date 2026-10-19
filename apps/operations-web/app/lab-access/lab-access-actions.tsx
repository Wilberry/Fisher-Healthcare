'use client';
import {useState} from 'react';
import type {FormEvent} from 'react';
import {useRouter} from 'next/navigation';
type Pending={id:string;labId:string;staffId:string;reason:string;requestedBy:string};
type Active={labId:string;staffId:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function LabAccessActions({pending,active}:{pending:Pending[];active:Active[]}){
  const [labId,setLabId]=useState(''),[staffId,setStaffId]=useState('');
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const router=useRouter();
  async function action(path:string,body:Record<string,unknown>,label:string){
    if(busy)return;
    setBusy(true);setMessage('');
    try{
      const result=await fetch('/api/phase3/ops/labs/'+path,{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'content-type':'application/json'},body:JSON.stringify(body)
      });
      if(!result.ok){
        setMessage(result.status===409?'Access request changed; refresh before retrying.':
          result.status===403?'This action requires a different authorized administrator.':
          'Operation not confirmed. Verify your current administrative permissions.');
        router.refresh();return;
      }
      setMessage(label+' recorded and audited. Refreshing the grant list.');
      if(path==='access-requests'){setLabId('');setStaffId('');setReason('');}
      router.refresh();
    }catch{setMessage('Network outcome unknown. Check the grant queue before retrying.');}
    finally{setBusy(false);}
  }
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!uuid.test(labId)||!uuid.test(staffId)||reason.trim().length<10)return;
    void action('access-requests',{labId:labId.toLowerCase(),
      staffId:staffId.toLowerCase(),reason:reason.trim()},'Access request');
  }
  return <section aria-label="Laboratory grants">
    <h2>Request coordinator access</h2>
    <form onSubmit={submit}>
      <label>Laboratory UUID
        <input value={labId} maxLength={36} required
          onChange={e=>setLabId(e.target.value)} style={{display:'block',padding:10}}/>
      </label>
      <label>Coordinator staff UUID
        <input value={staffId} maxLength={36} required
          onChange={e=>setStaffId(e.target.value)} style={{display:'block',padding:10}}/>
      </label>
      <label>Internal onboarding justification (10–240 characters)
        <textarea required minLength={10} maxLength={240} value={reason}
          onChange={e=>setReason(e.target.value)} rows={3}
          style={{display:'block',width:'100%',maxWidth:560,padding:10}}/>
      </label>
      <button type="submit" disabled={busy||reason.trim().length<10}>Request review</button>
    </form>
    <h2>Pending requests</h2>
    {!pending.length?<p role="status">No pending internal grant requests.</p>:
      <ul>{pending.map(req=><li key={req.id} style={{marginBottom:20}}>
        <p>Request {req.id} · Lab {req.labId} · Staff {req.staffId}</p>
        <p>Justification: {req.reason}</p>
        <p>Requesting administrator reference: {req.requestedBy}</p>
        <button type="button" disabled={busy}
          onClick={()=>void action('access-requests/'+req.id+'/approve',{},
            'Second-administrator approval')}>Approve after independent review</button>
      </li>)}</ul>}
    <h2>Active laboratory grants</h2>
    {!active.length?<p>No active laboratory grants.</p>:
      <ul>{active.map(grant=><li key={grant.labId+grant.staffId} style={{marginBottom:20}}>
        <p>Lab {grant.labId} · Staff {grant.staffId}</p>
        <button type="button" disabled={busy}
          onClick={()=>void action('access/'+grant.labId+'/staff/'+grant.staffId+'/revoke',{},
            'Coordinator access revocation')}>Revoke this grant</button>
      </li>)}</ul>}
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
