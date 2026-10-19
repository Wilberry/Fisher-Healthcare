import type {FormEvent} from 'react';
'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
export function PrepareManifest(){
  const [lab,setLab]=useState(''),[ids,setIds]=useState('');
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const router=useRouter();
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const specimenIds=ids.split(/[\s,]+/).filter(Boolean).map(id=>id.toLowerCase());
    if(!uuid.test(lab)||!specimenIds.length||specimenIds.length>100||
       new Set(specimenIds).size!==specimenIds.length||
       !specimenIds.every(id=>uuid.test(id))){
      setMessage('Enter a valid laboratory ID and 1–100 distinct specimen UUIDs.');return;
    }
    setBusy(true);setMessage('');
    try{
      const response=await fetch('/api/phase3/ops/lab-manifests',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({labId:lab.toLowerCase(),specimenIds})
      });
      if(!response.ok){
        setMessage(response.status===409?'Some specimens are not eligible. Refresh custody before retrying.':
          'Manifest creation declined. Only an authorized dispatcher can prepare handoffs.');
        router.refresh();return;
      }
      setLab('');setIds('');
      setMessage('Manifest prepared; awaiting an independently authenticated lab receipt.');
      router.refresh();
    }catch{setMessage('Unable to confirm creation; review the manifest queue before retrying.');}
    finally{setBusy(false);}
  }
  return <section className="fisher-section">
    <h2>Prepare a laboratory handoff</h2>
    <p>Dispatcher only. Use verified in-transit specimen UUIDs from the controlled custody system.</p>
    <form onSubmit={event=>void submit(event)}>
      <label htmlFor="lab-id">Laboratory UUID</label>
      <input id="lab-id" required value={lab} onChange={e=>setLab(e.target.value)}
        maxLength={36} style={{display:'block',padding:10,marginBottom:12,width:'100%',maxWidth:440}}/>
      <label htmlFor="manifest-specimens">Specimen UUIDs (one per line)</label>
      <textarea id="manifest-specimens" rows={5} value={ids} required
        onChange={e=>setIds(e.target.value)} style={{display:'block',padding:10,maxWidth:600,width:'100%'}}/>
      <button type="submit" disabled={busy}>{busy?'Preparing…':'Prepare manifest'}</button>
      <p role="status" aria-live="polite">{message}</p>
    </form>
  </section>;
}
