'use client';
import type {FormEvent} from 'react';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export function ReviewIncident({id}:{id:string}){
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const router=useRouter();
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||note.trim().length<8)return;
    setBusy(true);
    try{
      const response=await fetch('/api/phase3/ops/exceptions/'+id+'/resolve',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'content-type':'application/json'},body:JSON.stringify({note:note.trim()})
      });
      if(!response.ok){
        setMessage(response.status===409?'Incident changed since you opened this page. Refresh before reviewing.':
          'Resolution was not accepted. Confirm your active supervisor permissions.');
        router.refresh();return;
      }
      setNote('');
      setMessage('Incident resolved and recorded in the audit trail.');
      router.refresh();
    }catch{setMessage('The service is unreachable. Recheck incident status before retrying.');}
    finally{setBusy(false);}
  }
  return <form onSubmit={event=>void submit(event)}>
    <label htmlFor={'incident-note-'+id}>Resolution note (required)
      <textarea id={'incident-note-'+id} value={note} minLength={8} maxLength={2000} required
        onChange={event=>setNote(event.target.value)} rows={3}
        style={{display:'block',width:'100%',maxWidth:520,padding:10}}/>
    </label>
    <button type="submit" disabled={busy||note.trim().length<8}>
      {busy?'Recording…':'Resolve after review'}
    </button>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}
