'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
export function CourierAcknowledge({id}:{id:string}){
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const key=useRef<string|null>(null);
  const router=useRouter();
  async function send(){
    if(!confirmed||busy)return;
    if(!key.current)key.current=crypto.randomUUID();
    setBusy(true);setMessage('');
    try{
      const result=await fetch('/api/phase3/field/handoff-offers/'+id+'/ack',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({receiptKey:key.current})
      });
      if(!result.ok){
        if(result.status===409)key.current=null;
        setMessage(result.status===409?'Handoff or specimen state changed. Review before resubmitting.':
          'Acknowledgment denied. Confirm your assigned courier identity and MFA.');
        router.refresh();return;
      }
      key.current=null;setConfirmed(false);
      setMessage('Courier receipt accepted; custody updated atomically.');
      router.refresh();
    }catch{
      setMessage('The response is unknown; retry this acknowledgment with the same receipt key.');
    }finally{setBusy(false);}
  }
  return <section>
    <label>
      <input type="checkbox" checked={confirmed} disabled={busy}
        onChange={event=>setConfirmed(event.target.checked)}/>
      {' '}I have physically received and reconciled the package for this handoff
    </label>
    <div style={{marginTop:10}}>
      <button type="button" disabled={!confirmed||busy} onClick={()=>void send()}>
        {busy?'Recording acknowledgment…':'Acknowledge as receiving courier'}
      </button>
    </div>
    <p role="status" aria-live="polite">{message}</p>
  </section>;
}
